import { DR } from '@aneuhold/core-ts-lib';
import { createContainer } from '../../config/homelab/drivers/createContainer.js';
import { MACHINES } from '../../config/homelab/machines.js';
import { ALL_DEPLOYABLES, DEPLOYABLES } from '../../config/homelab/registry.js';
import {
  ConvergencePlan,
  Deployable,
  DeployableKind,
  DeployableState,
  DriftStatus,
  HomeLabMachine,
  MachineKind,
  MachineProbe,
  Observation,
  PlannedAction,
  ProbeContext,
  ReconcileItem
} from '../../config/homelab/types.js';
import { MainScriptsConfig } from '../ConfigService.js';
import DockerService from '../applications/DockerService.js';
import HomeLabDeployableService from './HomeLabDeployableService.js';
import HomeLabNetworkService from './HomeLabNetworkService.js';

/**
 * Owns desired-state reconciliation for the home lab: probes every reachable
 * machine once, asks each deployable to observe itself against that shared
 * snapshot, diffs observed vs. desired, and emits a {@link ConvergencePlan}.
 * `audit` prints the plan (dry run); `deploy`/apply executes it.
 */
export default class HomeLabReconcileService {
  /**
   * Probes every machine a single time into a shared {@link ProbeContext}:
   * reachability for all, and the running/stopped container sets plus docker
   * daemon state for docker hosts.
   */
  static buildProbeContext(): Promise<ProbeContext> {
    const machines: Record<HomeLabMachine, MachineProbe> = {
      [HomeLabMachine.Pi1]: this.probeMachine(HomeLabMachine.Pi1),
      [HomeLabMachine.Pi2]: this.probeMachine(HomeLabMachine.Pi2),
      [HomeLabMachine.Router]: this.probeMachine(HomeLabMachine.Router)
    };
    return Promise.resolve({ machines });
  }

  /**
   * Probes a single machine: SSH reachability, and for docker hosts the daemon
   * state plus running/stopped container name sets.
   *
   * @param machine the machine to probe
   */
  private static probeMachine(machine: HomeLabMachine): MachineProbe {
    const empty: ReadonlySet<string> = new Set();
    const reachable = HomeLabNetworkService.sshCapture(machine, 'echo ok', 8);
    const isReachable = reachable.exitCode === 0 && reachable.output === 'ok';

    if (!isReachable || MACHINES[machine].kind !== MachineKind.DockerHost) {
      return {
        reachable: isReachable,
        dockerOk: false,
        running: empty,
        stopped: empty
      };
    }

    const dockerCheck = HomeLabNetworkService.sshCapture(
      machine,
      DockerService.getDockerInfoCheckCommand()
    );
    const dockerOk = dockerCheck.output === 'ok';
    if (!dockerOk) {
      return {
        reachable: true,
        dockerOk: false,
        running: empty,
        stopped: empty
      };
    }

    const running = new Set(
      HomeLabNetworkService.parseContainerNames(
        HomeLabNetworkService.sshCapture(
          machine,
          DockerService.getRunningContainersCommand()
        ).output
      )
    );
    const stopped = new Set(
      HomeLabNetworkService.parseContainerNames(
        HomeLabNetworkService.sshCapture(
          machine,
          DockerService.getExitedContainersCommand()
        ).output
      )
    );
    return { reachable: true, dockerOk: true, running, stopped };
  }

  /**
   * Observes the given targets (default: all top-level deployables) against a
   * fresh probe context, classifies drift, and emits convergence actions. Also
   * reports containers found on docker hosts that match no registry deployable
   * as {@link DriftStatus.Unmanaged}.
   *
   * @param targets deployables to reconcile; defaults to {@link DEPLOYABLES}
   */
  static async reconcile(
    targets: Deployable[] = DEPLOYABLES
  ): Promise<ConvergencePlan> {
    const ctx = await this.buildProbeContext();
    const items: ReconcileItem[] = [];
    const actions: PlannedAction[] = [];

    for (const target of targets) {
      const observation = await target.observe(ctx);
      const status = this.classify(target, observation);
      items.push({ deployable: target, observation, status });
      actions.push(...this.planActions(target, observation, status));
    }

    items.push(...this.findUnmanaged(ctx));

    return { items, actions };
  }

  /**
   * Classifies how a deployable's observed placements differ from its desired
   * machine.
   *
   * @param target the deployable being reconciled
   * @param observation what the deployable observed
   */
  private static classify(
    target: Deployable,
    observation: Observation
  ): DriftStatus {
    const { placements } = observation;
    if (placements.length === 0) return DriftStatus.Missing;

    const onDesired = placements.find((p) => p.machine === target.machine);
    if (!onDesired) return DriftStatus.Misplaced;

    return onDesired.state === DeployableState.Stopped
      ? DriftStatus.Stopped
      : DriftStatus.Ok;
  }

  /**
   * Emits the convergence actions for a single classified deployable.
   *
   * @param target the deployable being reconciled
   * @param observation what the deployable observed
   * @param status the classified drift
   */
  private static planActions(
    target: Deployable,
    observation: Observation,
    status: DriftStatus
  ): PlannedAction[] {
    switch (status) {
      case DriftStatus.Missing:
        return [{ op: 'deploy', deployable: target, machine: target.machine }];
      case DriftStatus.Stopped:
        return [{ op: 'start', deployable: target, machine: target.machine }];
      case DriftStatus.Misplaced: {
        const actions: PlannedAction[] = observation.placements
          .filter((p) => p.machine !== target.machine)
          .map((p) => ({
            op: 'teardown' as const,
            deployable: target.onMachine(p.machine),
            machine: p.machine
          }));
        actions.push({
          op: 'deploy',
          deployable: target,
          machine: target.machine
        });
        return actions;
      }
      default:
        return [];
    }
  }

  /**
   * Finds containers present on any docker host that match no registry
   * deployable and reports them as unmanaged.
   *
   * @param ctx the probe context to scan
   */
  private static findUnmanaged(ctx: ProbeContext): ReconcileItem[] {
    const managed = new Set(
      ALL_DEPLOYABLES.filter((d) => d.kind === DeployableKind.Container).map(
        (d) => d.name
      )
    );
    const items: ReconcileItem[] = [];

    for (const machine of Object.values(HomeLabMachine)) {
      const probe = ctx.machines[machine];
      for (const name of [...probe.running, ...probe.stopped]) {
        if (managed.has(name)) continue;
        const state = probe.running.has(name)
          ? DeployableState.Running
          : DeployableState.Stopped;
        items.push({
          deployable: createContainer({ name, machine }),
          observation: { placements: [{ machine, state }] },
          status: DriftStatus.Unmanaged
        });
      }
    }
    return items;
  }

  /**
   * Groups planned actions by machine, separating adds (deploy/start) from
   * removes (teardown).
   *
   * @param plan the plan whose actions to group
   */
  static groupActionsByMachine(
    plan: ConvergencePlan
  ): Map<HomeLabMachine, { adds: PlannedAction[]; removes: PlannedAction[] }> {
    const grouped = new Map<
      HomeLabMachine,
      { adds: PlannedAction[]; removes: PlannedAction[] }
    >();
    for (const action of plan.actions) {
      const bucket = grouped.get(action.machine) ?? { adds: [], removes: [] };
      if (action.op === 'teardown') bucket.removes.push(action);
      else bucket.adds.push(action);
      grouped.set(action.machine, bucket);
    }
    return grouped;
  }

  /**
   * Prints a human-readable reconciliation report — the dry run that `audit`
   * shows. Lists each deployable's drift status, then the per-machine change
   * summary.
   *
   * @param plan the plan to print
   */
  static printPlan(plan: ConvergencePlan): void {
    DR.logger.info('Home lab convergence plan:\n');

    for (const item of plan.items) {
      const where = item.observation.placements
        .map((p) => `${p.machine}:${p.state}`)
        .join(', ');
      const detail = where ? ` (${where})` : '';
      DR.logger.info(`  [${item.status}] ${item.deployable.name}${detail}`);
    }

    if (plan.actions.length === 0) {
      DR.logger.info('\nNo changes needed — everything is converged.');
      return;
    }

    DR.logger.info('\nPlanned changes:');
    for (const [machine, { adds, removes }] of this.groupActionsByMachine(
      plan
    )) {
      const parts: string[] = [];
      if (adds.length > 0) parts.push(`+${adds.length} add`);
      if (removes.length > 0) parts.push(`-${removes.length} remove`);
      DR.logger.info(`  ${machine}: ${parts.join(' / ')}`);
      for (const a of removes) {
        DR.logger.info(`    - teardown ${a.deployable.name}`);
      }
      for (const a of adds) {
        DR.logger.info(`    + ${a.op} ${a.deployable.name}`);
      }
    }
  }

  /**
   * Executes a plan's actions in order via {@link HomeLabDeployableService},
   * respecting each deployable's `dependsOn` ordering during deploys.
   *
   * @param plan the plan to apply
   * @param config user config passed to deploy ops
   */
  static async apply(
    plan: ConvergencePlan,
    config: MainScriptsConfig
  ): Promise<void> {
    for (const action of plan.actions) {
      if (action.op === 'teardown') {
        await HomeLabDeployableService.run(
          'teardown',
          action.deployable,
          config,
          false
        );
      } else {
        await HomeLabDeployableService.run(
          action.op,
          action.deployable,
          config
        );
      }
    }
  }
}
