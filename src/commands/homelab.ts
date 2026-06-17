import { DR } from '@aneuhold/core-ts-lib';
import { confirm, input, select, Separator } from '@inquirer/prompts';
import { spawnSync } from 'child_process';
import {
  ALL_STACKS,
  APPLICATION_MACHINE_MAP,
  APPLICATIONS,
  getExpectedApps,
  HomeLabApplication,
  HomeLabApplicationInfo,
  HomeLabMachine,
  HomeLabStack,
  StackOrAppOps
} from '../config/homelab/homeLabNetworkMap.js';
import CLIService from '../services/CLIService.js';
import { ConfigService } from '../services/ConfigService.js';
import HomeLabApplicationService from '../services/HomeLab/HomeLabApplicationService.js';
import HomeLabNetworkService from '../services/HomeLab/HomeLabNetworkService.js';
import HomeLabStackService from '../services/HomeLab/HomeLabStackService.js';

enum HomelabSubcommand {
  Deploy = 'deploy',
  Start = 'start',
  Stop = 'stop',
  Restart = 'restart',
  Logs = 'logs',
  Status = 'status',
  Teardown = 'teardown',
  ConfigureRouter = 'configure-router',
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

type SelectedTarget =
  | { type: 'stack'; stack: HomeLabStack }
  | { type: 'app'; info: HomeLabApplicationInfo };

/**
 * Returns true if the given application can perform the requested op —
 * either via an explicit ops entry or because it has a machine assignment that
 * supports a default implementation.
 *
 * @param op the operation key to check
 * @param info the application entry
 */
function appCanPerformOp(
  op: keyof StackOrAppOps,
  info: HomeLabApplicationInfo
): boolean {
  if (info.ops?.[op] !== undefined) return true;
  if (op === 'deploy' || op === 'teardown') return false;
  return APPLICATION_MACHINE_MAP[info.id] !== undefined;
}

/**
 * Presents a grouped selection prompt and returns the chosen stack or
 * application. Only targets that can perform the requested op are shown.
 * Stacks always appear since all ops have default implementations.
 *
 * @param op the operation being requested
 */
async function selectTarget(op: keyof StackOrAppOps): Promise<SelectedTarget> {
  const choices: Array<Separator | { name: string; value: SelectedTarget }> =
    [];

  for (const stack of Object.values(ALL_STACKS)) {
    choices.push(new Separator(stack.name));
    choices.push({
      name: stack.name,
      value: { type: 'stack' as const, stack }
    });

    if (op !== 'teardown') {
      for (const appId of stack.applications) {
        const info = APPLICATIONS[appId];
        if (appCanPerformOp(op, info)) {
          choices.push({
            name: `  ${appId}`,
            value: { type: 'app' as const, info }
          });
        }
      }
    }
  }

  const standaloneApps = Object.values(APPLICATIONS).filter(
    (info) =>
      APPLICATION_MACHINE_MAP[info.id] === undefined &&
      info.ops?.[op] !== undefined
  );

  if (standaloneApps.length > 0) {
    choices.push(new Separator('Standalone'));
    for (const info of standaloneApps) {
      choices.push({
        name: info.id,
        value: { type: 'app' as const, info }
      });
    }
  }

  return select({
    message: `Select a target  (${op})`,
    choices
  });
}

/**
 * Discovers the IP of the machine hosting Pi-hole, prints the EdgeRouter CLI
 * commands to enable NetFlow / syslog forwarding / DHCP DNS, then applies
 * them via SSH.
 *
 * @param routerHost hostname or IP of the EdgeRouter
 * @param routerUser SSH username on the EdgeRouter
 */
function configureRouter(routerHost: string, routerUser: string): void {
  const piholeMachine = APPLICATION_MACHINE_MAP[HomeLabApplication.Pihole];
  if (!piholeMachine) {
    DR.logger.error('Pihole is not assigned to any machine');
    process.exit(1);
  }

  DR.logger.info(`Discovering IP of ${piholeMachine}...`);

  const ipResult = HomeLabNetworkService.sshCapture(
    piholeMachine,
    "hostname -I | awk '{print $1}'"
  );

  if (ipResult.exitCode !== 0 || !ipResult.output) {
    DR.logger.error(
      `Could not determine IP of ${piholeMachine}. Is it reachable?`
    );
    process.exit(1);
  }

  const piIp = ipResult.output;
  DR.logger.info(`${piholeMachine} LAN IP: ${piIp}`);

  const commands = [
    'configure',
    'set system flow-accounting interface eth0',
    'set system flow-accounting netflow version 9',
    `set system flow-accounting netflow server ${piIp} port 2055`,
    'set system flow-accounting netflow timeout expiry-interval 60',
    'set system flow-accounting netflow timeout flow-generic 60',
    'set system flow-accounting netflow timeout max-active-life 600',
    `set system syslog host ${piIp} facility all level info`,
    // Update shared-network-name values to match your router's DHCP config
    `set service dhcp-server shared-network-name LAN dns-server ${piIp}`,
    `set service dhcp-server shared-network-name IoT dns-server ${piIp}`,
    'commit',
    'save',
    'exit'
  ].join('\n');

  DR.logger.info('\nEdgeRouter commands to apply:');
  DR.logger.info('---');
  DR.logger.info(commands);
  DR.logger.info('---');
  DR.logger.info(
    `\nConnecting to ${routerHost} as ${routerUser} to apply config...`
  );

  const result = spawnSync('ssh', [`${routerUser}@${routerHost}`, '-T'], {
    input: commands,
    stdio: ['pipe', 'inherit', 'inherit']
  });

  if (result.status !== 0) {
    DR.logger.error(
      `Router SSH session exited with code ${result.status ?? 'unknown'}. ` +
        `Apply the commands above manually via: tb connect router`
    );
    process.exit(result.status ?? 1);
  }

  DR.logger.info('EdgeRouter configuration applied.');
}

/**
 * Audits the home lab: checks SSH reachability of every machine, verifies
 * Docker-capable machines have exactly their expected containers running, and
 * flags anything stopped or unexpected.
 */
function audit(): void {
  DR.logger.info('Auditing home lab network...\n');

  for (const machine of Object.values(HomeLabMachine)) {
    const sshHost = HomeLabNetworkService.sshHost(machine);
    DR.logger.info(`[${machine}]  ${sshHost}`);

    const reachable = HomeLabNetworkService.sshCapture(machine, 'echo ok', 8);
    if (reachable.exitCode !== 0 || reachable.output !== 'ok') {
      DR.logger.error('  Unreachable via SSH\n');
      continue;
    }

    if (machine === HomeLabMachine.Router) {
      DR.logger.info('  ✓ Reachable via SSH\n');
      continue;
    }

    const dockerCheck = HomeLabNetworkService.sshCapture(
      machine,
      'docker info > /dev/null 2>&1 && echo ok || echo no_docker'
    );
    if (dockerCheck.output !== 'ok') {
      DR.logger.error('  Docker not installed or daemon not running\n');
      continue;
    }

    const running = new Set(
      HomeLabNetworkService.parseContainerNames(
        HomeLabNetworkService.sshCapture(
          machine,
          "docker ps --format '{{.Names}}'"
        ).output
      )
    );
    const stopped = new Set(
      HomeLabNetworkService.parseContainerNames(
        HomeLabNetworkService.sshCapture(
          machine,
          "docker ps -a --filter status=exited --format '{{.Names}}'"
        ).output
      )
    );

    const expectedApps = getExpectedApps(machine);

    if (expectedApps.length === 0) {
      DR.logger.info('  (no applications configured for this machine)');
    }

    for (const app of expectedApps) {
      if (running.has(app)) {
        DR.logger.info(`  ✓ ${app}`);
      } else if (stopped.has(app)) {
        DR.logger.error(`  ✗ ${app} — stopped`);
      } else {
        DR.logger.error(`  ✗ ${app} — not found`);
      }
    }

    const expectedNames = new Set<string>(expectedApps);
    for (const name of [...running, ...stopped]) {
      if (!expectedNames.has(name)) {
        DR.logger.info(
          `  ? ${name} — unexpected (not in APPLICATION_MACHINE_MAP)`
        );
      }
    }

    DR.logger.info('');
  }
}

/**
 * Runs the interactive teardown flow for a stack: shows what will be removed,
 * asks about volumes, and requires the user to type the machine hostname to
 * confirm before proceeding.
 */
async function runTeardown(): Promise<void> {
  const stackList = Object.values(ALL_STACKS);
  const stack =
    stackList.length === 1
      ? stackList[0]
      : await select({
          message: 'Select a stack to tear down',
          choices: stackList.map((s) => ({ name: s.name, value: s }))
        });

  DR.logger.info(`\nAbout to tear down "${stack.name}" on ${stack.machine}:`);
  DR.logger.info(`  Containers: ${stack.applications.join(', ')}\n`);

  const removeVolumes = await confirm({
    message: 'Also remove volumes?',
    default: false
  });

  if (removeVolumes) {
    DR.logger.info('  All named volumes will be deleted.\n');
  }

  const entered = await input({
    message: `Type the machine hostname to confirm (${stack.machine}):`
  });

  const machineId: string = stack.machine;
  if (entered !== machineId) {
    DR.logger.info('Aborted — hostname did not match.');
    return;
  }

  HomeLabStackService.teardown(stack, removeVolumes);
}

/**
 * Manages the home lab: deploy, control, monitor, and audit stacks and
 * individual applications.
 *
 * @param subcommand the action to perform
 * @param routerHost for configure-router: EdgeRouter hostname or IP
 * @param routerUser for configure-router: SSH username on the EdgeRouter
 */
export default async function homelab(
  subcommand?: string,
  routerHost = 'ubnt.local',
  routerUser = 'admin'
): Promise<void> {
  const selected =
    subcommand ??
    (await CLIService.selectFromList(Object.values(HomelabSubcommand)));

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
      const config = await ConfigService.loadConfig();
      if (target.type === 'stack') {
        HomeLabStackService.deploy(target.stack, config);
      } else {
        HomeLabApplicationService.deploy(target.info, config);
      }
      break;
    }

    case HomelabSubcommand.Start: {
      const target = await selectTarget('start');
      if (target.type === 'stack') {
        HomeLabStackService.start(target.stack);
      } else {
        HomeLabApplicationService.start(target.info);
      }
      break;
    }

    case HomelabSubcommand.Stop: {
      const target = await selectTarget('stop');
      if (target.type === 'stack') {
        HomeLabStackService.stop(target.stack);
      } else {
        HomeLabApplicationService.stop(target.info);
      }
      break;
    }

    case HomelabSubcommand.Restart: {
      const target = await selectTarget('restart');
      if (target.type === 'stack') {
        HomeLabStackService.restart(target.stack);
      } else {
        HomeLabApplicationService.restart(target.info);
      }
      break;
    }

    case HomelabSubcommand.Status: {
      const target = await selectTarget('status');
      if (target.type === 'stack') {
        HomeLabStackService.status(target.stack);
      } else {
        HomeLabApplicationService.status(target.info);
      }
      break;
    }

    case HomelabSubcommand.Logs: {
      const target = await selectTarget('logs');
      if (target.type === 'stack') {
        const services = ['all', ...target.stack.applications];
        const selectedService = await CLIService.selectFromList(services);
        const service = selectedService === 'all' ? undefined : selectedService;
        HomeLabStackService.logs(target.stack, service);
      } else {
        HomeLabApplicationService.logs(target.info);
      }
      break;
    }

    case HomelabSubcommand.Teardown:
      await runTeardown();
      break;

    case HomelabSubcommand.ConfigureRouter:
      configureRouter(routerHost, routerUser);
      break;

    case HomelabSubcommand.Audit:
      audit();
      break;
  }
}
