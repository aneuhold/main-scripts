import { DR } from '@aneuhold/core-ts-lib';
import { CAPABILITY_DETECTORS } from '../../config/homelab/detectors/index.js';
import { MACHINES } from '../../config/homelab/machines.js';
import { DEPLOYABLES } from '../../config/homelab/registry.js';
import {
  ConvergencePlan,
  Deployable,
  DeployableState,
  DetectionContext,
  DriftStatus,
  HomeLabMachine,
  MachineSnapshot,
  Observation,
  PlannedAction,
  ReconcileItem
} from '../../config/homelab/types.js';
import CliLogger from '../../utils/CliLogger.js';
import { MainScriptsConfig } from '../ConfigService.js';
import HomeLabDeployableService from './HomeLabDeployableService.js';
import HomeLabNetworkService from './HomeLabNetworkService.js';

/**
 * Owns desired-state reconciliation for the home lab: detects every reachable
 * machine once, asks each deployable to observe itself against that shared
 * snapshot, diffs observed vs. desired, and emits a {@link ConvergencePlan}.
 * `audit` prints the plan (dry run); `deploy`/apply executes it.
 */
export default class HomeLabReconcileService {
  /**
   * Detects every machine a single time into a shared {@link DetectionContext}:
   * reachability for all, plus whatever each applicable capability detector
   * contributes (e.g. container sets for docker hosts). Probes the machines
   * concurrently behind a spinner so connect timeouts overlap and progress stays
   * visible.
   */
  static async buildDetectionContext(): Promise<DetectionContext> {
    const machineList = Object.values(HomeLabMachine);
    let done = 0;
    const spinner = CliLogger.spinner(
      `Detecting machines (0/${machineList.length})...`
    );

    const detect = async (
      machine: HomeLabMachine
    ): Promise<MachineSnapshot> => {
      const snapshot = await this.detectMachine(machine);
      done += 1;
      spinner.update(`Detecting machines (${done}/${machineList.length})...`);
      return snapshot;
    };

    const [pi1, pi2, router] = await Promise.all([
      detect(HomeLabMachine.Pi1),
      detect(HomeLabMachine.Pi2),
      detect(HomeLabMachine.Router)
    ]);
    spinner.succeed(`Detected ${machineList.length} machines`);

    const machines: Record<HomeLabMachine, MachineSnapshot> = {
      [HomeLabMachine.Pi1]: pi1,
      [HomeLabMachine.Pi2]: pi2,
      [HomeLabMachine.Router]: router
    };
    return { machines };
  }

  /**
   * Detects a single machine: universal SSH reachability, then each capability
   * detector that applies to the machine's kind (e.g. Docker container sets for
   * docker hosts). Capability knowledge lives in {@link CAPABILITY_DETECTORS},
   * not here.
   *
   * @param machine the machine to detect
   */
  private static async detectMachine(
    machine: HomeLabMachine
  ): Promise<MachineSnapshot> {
    const reachable = await HomeLabNetworkService.sshCapture(
      machine,
      'echo ok',
      8
    );
    let snapshot: MachineSnapshot = {
      reachable: reachable.exitCode === 0 && reachable.output === 'ok'
    };
    if (!snapshot.reachable) return snapshot;

    const kind = MACHINES[machine].kind;
    for (const detector of CAPABILITY_DETECTORS) {
      if (detector.appliesTo.includes(kind)) {
        snapshot = { ...snapshot, ...(await detector.detect(machine)) };
      }
    }
    return snapshot;
  }

  /**
   * Observes the given targets (default: all top-level deployables) against a
   * fresh detection context, classifies drift, and emits convergence actions. Also
   * reports containers found on docker hosts that match no registry deployable
   * as {@link DriftStatus.Unmanaged}.
   *
   * @param targets deployables to reconcile; defaults to {@link DEPLOYABLES}
   */
  static async reconcile(
    targets: Deployable[] = DEPLOYABLES
  ): Promise<ConvergencePlan> {
    const ctx = await this.buildDetectionContext();
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
   * Asks each capability detector for entities present on the machines it
   * applies to that match no registry deployable (e.g. stray containers on a
   * docker host), reported as {@link DriftStatus.Unmanaged}.
   *
   * @param ctx the detection context to scan
   */
  private static findUnmanaged(ctx: DetectionContext): ReconcileItem[] {
    const items: ReconcileItem[] = [];
    for (const machine of Object.values(HomeLabMachine)) {
      const kind = MACHINES[machine].kind;
      const snapshot = ctx.machines[machine];
      for (const detector of CAPABILITY_DETECTORS) {
        if (detector.appliesTo.includes(kind) && detector.findUnmanaged) {
          items.push(...detector.findUnmanaged(machine, snapshot));
        }
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
  private static groupActionsByMachine(
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
   * Prints a human-readable reconciliation report, the dry run that `audit`
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
      DR.logger.info('\nNo changes needed. Everything is converged.');
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
