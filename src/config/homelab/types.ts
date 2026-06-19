import { MainScriptsConfig } from '../../services/Config.service.js';

/**
 * Identifies a physical machine in the home lab. Use stable hardware
 * identifiers here, not roles like "primary" or "spare", which can change.
 */
export enum HomeLabMachine {
  Pi1 = 'pi3-bplus-1',
  Pi2 = 'pi3-b-1',
  Router = 'edgerouter-x'
}

/**
 * The role a machine plays in the home lab. Drives generic reasoning (e.g.
 * which machines can host containers) without hand-maintained lists.
 */
export enum MachineKind {
  DockerHost = 'docker-host',
  Router = 'router'
}

/**
 * Connection and role data for a single machine.
 */
export type MachineInfo = {
  /**
   * Built-in default SSH login user. The `homelab.machineCreds` config can
   * override it per machine.
   */
  user: string;
  /** SSH host (IP or hostname). */
  host: string;
  /** Role this machine plays in the home lab. */
  kind: MachineKind;
};

/**
 * Discriminator used by audit/selection to reason about a deployable
 * generically (e.g. "which containers should run on this machine") without
 * hand-maintained lists. Downstream code never branches on the driver that
 * produced a deployable, only on this breadcrumb when it must reason by kind.
 */
export enum DeployableKind {
  Compose = 'compose',
  Container = 'container',
  HostSetup = 'host-setup',
  Router = 'router'
}

/**
 * The uniform lifecycle operations a deployable can expose. Each is optional: a
 * driver defines only the ops its kind supports (a container has no `deploy`, a
 * host-setup has only `deploy`), and a missing op simply means "not supported".
 * Selection hides it and the dispatcher skips it. Per-unit overrides
 * shallow-merge on top, so the dispatcher just calls `ops[op]?.(...)`.
 */
export type DeployableOps = {
  /** Make reality match config. Async because some deployables (the router) must discover data first. */
  deploy?: (config: MainScriptsConfig) => void | Promise<void>;
  /** Stop and remove, optionally deleting named volumes. */
  teardown?: (removeVolumes: boolean) => void | Promise<void>;
  start?: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  restart?: () => void | Promise<void>;
  status?: () => void | Promise<void>;
  /** Stream logs, optionally filtered to a single service/container. */
  logs?: (service?: string) => void | Promise<void>;
};

/**
 * Name of one of the lifecycle operations.
 */
export type DeployableOpKey = keyof DeployableOps;

/**
 * The observed state of a deployable at a single placement. The "present"
 * states differ by deployable kind: process-backed deployables report
 * {@link Running}/{@link Stopped} (a process is or isn't up), while deployables
 * with no long-lived process report {@link Configured} when their desired
 * condition is satisfied.
 */
export enum DeployableState {
  /** A process-backed deployable is up. */
  Running = 'running',
  /** A process-backed deployable exists but its process is not running. */
  Stopped = 'stopped',
  /** A process-less deployable's desired condition is in place. */
  Configured = 'configured'
}

/**
 * Where a deployable was found and in what state.
 */
export type Placement = {
  machine: HomeLabMachine;
  state: DeployableState;
};

/**
 * Docker daemon snapshot for a docker-host machine: the container name sets used
 * to detect placements. Present on a {@link MachineSnapshot} only when the host
 * is reachable and its daemon is up.
 */
export type DockerSnapshot = {
  /** Names of currently running containers. */
  running: ReadonlySet<string>;
  /** Names of stopped (exited) containers. */
  stopped: ReadonlySet<string>;
};

/**
 * Per-machine actual state, detected once and shared with every `observe`.
 * {@link reachable} is universal; capability detectors fill in the rest, so the
 * generic reconcile core stays free of any single service's concepts.
 */
export type MachineSnapshot = {
  /** Whether the machine answered SSH. */
  reachable: boolean;
  /** Docker snapshot; present only for reachable docker hosts whose daemon is up. */
  docker?: DockerSnapshot;
};

/**
 * Collected once per reconcile and handed to every {@link Deployable.observe},
 * so a deployable can detect itself from shared state instead of re-detecting.
 */
export type DetectionContext = {
  machines: Record<HomeLabMachine, MachineSnapshot>;
};

/**
 * How a deployable's observed state differs from its desired state.
 */
export enum DriftStatus {
  /** Running where it should be. */
  Ok = 'ok',
  /** Present on the desired machine but not running. */
  Stopped = 'stopped',
  /** Running on a machine other than the desired one. */
  Misplaced = 'misplaced',
  /** Not found anywhere. */
  Missing = 'missing',
  /** Found on a machine but matching no registry deployable. */
  Unmanaged = 'unmanaged'
}

/**
 * One deployable's place in the reconciliation: what it is, what was observed,
 * and how the two differ.
 */
export type ReconcileItem = {
  deployable: Deployable;
  observation: Observation;
  status: DriftStatus;
};

/**
 * A pluggable per-capability machine detector. The reconcile service detects
 * universal reachability, then runs every detector whose {@link appliesTo}
 * includes a machine's {@link MachineKind} to fill in capability-specific state
 * (e.g. Docker container sets) and to surface entities that match no registry
 * deployable. Keeps capability knowledge out of the generic reconcile core.
 * Adding a capability means appending a detector, never editing the reconciler.
 */
export type MachineCapabilityDetector = {
  /** Machine kinds this detector applies to. */
  appliesTo: MachineKind[];
  /** Fills in this capability's slice of a machine's snapshot. */
  detect: (machine: HomeLabMachine) => Promise<Partial<MachineSnapshot>>;
  /**
   * Reports entities this capability found on the machine that match no registry
   * deployable (e.g. stray containers). Omitted if the capability has nothing to
   * report.
   */
  findUnmanaged?: (
    machine: HomeLabMachine,
    snapshot: MachineSnapshot
  ) => ReconcileItem[];
};

/**
 * A single convergence step to make reality match config. For a misplacement
 * the teardown action carries `deployable.onMachine(observedMachine)` so it
 * targets the machine the deployable is wrongly running on.
 */
export type PlannedAction = {
  op: Extract<DeployableOpKey, 'deploy' | 'teardown' | 'start'>;
  deployable: Deployable;
  machine: HomeLabMachine;
};

/**
 * The full result of a reconcile: the per-deployable diff and the ordered list
 * of actions that would converge reality onto config.
 */
export type ConvergencePlan = {
  items: ReconcileItem[];
  actions: PlannedAction[];
};

/**
 * A composable unit of the home lab with a uniform lifecycle. A stack is a
 * `Deployable` that contains child `Deployable`s; a one-shot setup or
 * configuration step is a leaf `Deployable`. Built by driver factories, so
 * downstream code only ever sees this shape and never branches on the driver.
 */
export type Deployable = {
  /** Identity / container name / audit key. */
  name: string;
  /** Display label for prompts. */
  label: string;
  /** Machine this deployable targets. */
  machine: HomeLabMachine;
  /** Discriminator for audit/selection. */
  kind: DeployableKind;
  /**
   * The supported lifecycle ops, fully resolved (driver default + override).
   * Only the ops this deployable's kind supports are present; an absent op means
   * "not supported" (selection hides it, the dispatcher skips it).
   */
  ops: DeployableOps;
  /** Stack members; `[]` for leaves. Children inherit the parent's machine. */
  children: Deployable[];
  /**
   * Names of other deployables that must be deployed/satisfied before this one
   * can deploy, so prerequisites are in place first. Enforced at deploy time.
   * See HomeLabDeployableService.
   */
  dependsOn: string[];
  /**
   * Self-audit: detects where this deployable actually is and in what state,
   * using the shared {@link DetectionContext}. The detection is driver-specific.
   */
  observe: (ctx: DetectionContext) => Promise<Observation>;
  /**
   * Re-binds this deployable to a different machine, returning an equivalent
   * `Deployable` whose ops/observe target that machine, e.g. to act on it where
   * it currently runs rather than where it is configured to run.
   */
  onMachine: (machine: HomeLabMachine) => Deployable;
};

/**
 * What one deployable's {@link Deployable.observe} found. Empty placements mean
 * it was found nowhere.
 */
export type Observation = {
  placements: Placement[];
  /** Optional kind-specific detail for display. */
  detail?: string;
};
