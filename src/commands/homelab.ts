import { DR } from '@aneuhold/core-ts-lib';
import { confirm, input, select, Separator } from '@inquirer/prompts';
import {
  ConvergencePlan,
  Deployable,
  DeployableOpKey,
  DEPLOYABLES,
  getExpectedContainers
} from '../config/homelab/registry.js';
import CLIService from '../services/CLIService.js';
import { ConfigService } from '../services/ConfigService.js';
import HomeLabDeployableService from '../services/HomeLab/HomeLabDeployableService.js';
import HomeLabReconcileService from '../services/HomeLab/HomeLabReconcileService.js';

enum HomelabSubcommand {
  Deploy = 'deploy',
  Start = 'start',
  Stop = 'stop',
  Restart = 'restart',
  Logs = 'logs',
  Status = 'status',
  Teardown = 'teardown',
  Audit = 'audit'
}

/**
 * Returns true if the given string is a valid {@link HomelabSubcommand}.
 *
 * @param value the string to check
 */
function isHomelabSubcommand(value: string): value is HomelabSubcommand {
  return Object.values(HomelabSubcommand).includes(value as HomelabSubcommand);
}

/**
 * Presents a grouped selection prompt and returns the chosen deployable. Each
 * top-level deployable that supports the op appears as a group entry; for
 * non-teardown ops its op-supporting children are listed beneath it.
 *
 * @param op the operation being requested
 */
async function selectTarget(op: DeployableOpKey): Promise<Deployable> {
  const choices: Array<Separator | { name: string; value: Deployable }> = [];

  for (const deployable of DEPLOYABLES) {
    if (deployable.ops[op] === undefined) continue;

    choices.push(new Separator(deployable.label));
    choices.push({ name: deployable.label, value: deployable });

    if (op !== 'teardown') {
      for (const child of deployable.children) {
        if (child.ops[op] !== undefined) {
          choices.push({ name: `  ${child.name}`, value: child });
        }
      }
    }
  }

  return select({ message: `Select a target  (${op})`, choices });
}

/**
 * Confirms a destructive-aware plan before applying. A plan with no teardown
 * actions takes a simple yes/no; any teardown requires typing each affected
 * machine's hostname (the existing teardown guard).
 *
 * @param plan the plan about to be applied
 */
async function confirmPlan(plan: ConvergencePlan): Promise<boolean> {
  const teardownActions = plan.actions.filter((a) => a.op === 'teardown');

  if (teardownActions.length === 0) {
    return confirm({ message: 'Apply this plan?', default: false });
  }

  DR.logger.info('\nThis plan tears down deployables on the machine(s) below.');
  const machines = [...new Set(teardownActions.map((a) => a.machine))];
  for (const machine of machines) {
    const machineId: string = machine;
    const entered = await input({
      message: `Type the machine hostname to confirm teardown (${machine}):`
    });
    if (entered !== machineId) {
      DR.logger.info('Aborted — hostname did not match.');
      return false;
    }
  }
  return true;
}

/**
 * Runs an op that needs no extra argument (start/stop/restart/status): prompts
 * for a target and dispatches.
 *
 * @param op the operation to run
 */
async function runSimpleOp(op: DeployableOpKey): Promise<void> {
  const target = await selectTarget(op);
  const config = await ConfigService.loadConfig();
  await HomeLabDeployableService.run(op, target, config);
}

/**
 * Reconciles the given targets into a plan, prints it, and — unless it is a
 * no-op or the user declines — applies it.
 *
 * @param targets deployables to reconcile and apply
 */
async function applyPlan(targets: Deployable[]): Promise<void> {
  const config = await ConfigService.loadConfig();
  const plan = await HomeLabReconcileService.reconcile(targets);
  HomeLabReconcileService.printPlan(plan);

  if (plan.actions.length === 0) return;

  if (!(await confirmPlan(plan))) return;

  await HomeLabReconcileService.apply(plan, config);
}

/**
 * Runs the interactive teardown flow for a deployable: shows what will be
 * removed, asks about volumes, and requires typing the machine hostname to
 * confirm before proceeding.
 */
async function runTeardown(): Promise<void> {
  const target = await selectTarget('teardown');

  DR.logger.info(
    `\nAbout to tear down "${target.label}" on ${target.machine}:`
  );
  const containers = getExpectedContainers(target.machine);
  if (containers.length > 0) {
    DR.logger.info(`  Containers: ${containers.join(', ')}\n`);
  }

  const removeVolumes = await confirm({
    message: 'Also remove volumes?',
    default: false
  });
  if (removeVolumes) {
    DR.logger.info('  All named volumes will be deleted.\n');
  }

  const machineId: string = target.machine;
  const entered = await input({
    message: `Type the machine hostname to confirm (${target.machine}):`
  });
  if (entered !== machineId) {
    DR.logger.info('Aborted — hostname did not match.');
    return;
  }

  const config = await ConfigService.loadConfig();
  await HomeLabDeployableService.run('teardown', target, config, removeVolumes);
}

/**
 * Manages the home lab: deploy (apply a convergence plan), control, monitor, and
 * audit (dry-run reconcile) deployables.
 *
 * @param subcommand the action to perform
 */
export default async function homelab(subcommand?: string): Promise<void> {
  const selected =
    subcommand ??
    (await CLIService.selectFromList(
      Object.values(HomelabSubcommand),
      'Select a homelab action'
    ));

  if (!isHomelabSubcommand(selected)) {
    const available = Object.values(HomelabSubcommand).join(', ');
    DR.logger.error(
      `Unknown subcommand "${selected}". Available: ${available}`
    );
    process.exit(1);
  }

  switch (selected) {
    case HomelabSubcommand.Deploy: {
      const target = await selectTarget('deploy');
      await applyPlan([target]);
      break;
    }

    case HomelabSubcommand.Start:
      await runSimpleOp('start');
      break;

    case HomelabSubcommand.Stop:
      await runSimpleOp('stop');
      break;

    case HomelabSubcommand.Restart:
      await runSimpleOp('restart');
      break;

    case HomelabSubcommand.Status:
      await runSimpleOp('status');
      break;

    case HomelabSubcommand.Logs: {
      const target = await selectTarget('logs');
      const config = await ConfigService.loadConfig();
      let service: string | undefined;
      if (target.children.length > 0) {
        const services = ['all', ...target.children.map((c) => c.name)];
        const selectedService = await CLIService.selectFromList(
          services,
          'Select a service for logs'
        );
        service = selectedService === 'all' ? undefined : selectedService;
      }
      await HomeLabDeployableService.run('logs', target, config, service);
      break;
    }

    case HomelabSubcommand.Teardown:
      await runTeardown();
      break;

    case HomelabSubcommand.Audit: {
      const plan = await HomeLabReconcileService.reconcile();
      HomeLabReconcileService.printPlan(plan);
      break;
    }
  }
}
