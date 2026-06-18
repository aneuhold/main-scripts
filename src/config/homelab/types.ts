import { MainScriptsConfig } from '../../services/ConfigService.js';

/**
 * Identifies a physical machine in the home lab. Use stable hardware
 * identifiers here — not roles like "primary" or "spare", which can change.
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
  /** SSH connection string (user@host). */
  sshHost: string;
  /** Role this machine plays in the home lab. */
  kind: MachineKind;
};

/**
 * Discriminator used by audit/selection to reason about a deployable
 * generically (e.g. "which containers should run on this machine") without
 * hand-maintained lists. Downstream code never branches on the driver that
 * produced a deployable — only on this breadcrumb when it must reason by kind.
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
 * host-setup has only `deploy`), and a missing op simply means "not supported"
 * — selection hides it and the dispatcher skips it. Per-unit overrides
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
 * The observed state of a deployable at a single placement. The two "present"
 * states differ by deployable kind: container-backed deployables report
 * {@link Running}/{@link Stopped} (a process is or isn't up), while one-shot
 * deployables that have no long-lived process (host setup, router config) report
 * {@link Configured} when their desired condition is satisfied.
 */
export enum DeployableState {
  /** A container-backed deployable is up (its container is running). */
  Running = 'running',
  /** A container-backed deployable exists but its container is exited. */
  Stopped = 'stopped',
  /** A process-less deployable's desired condition is in place (e.g. the Docker daemon is up, or the router is reachable/configured). */
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
 * What one deployable's {@link Deployable.observe} found. Empty placements mean
 * it was found nowhere.
 */
export type Observation = {
  placements: Placement[];
  /** Optional kind-specific detail for display. */
  detail?: string;
};

/**
 * Per-machine actual state, probed once and shared with every `observe`.
 */
export type MachineProbe = {
  /** Whether the machine answered SSH. */
  reachable: boolean;
  /** Whether the Docker daemon is up (docker-host machines only). */
  dockerOk: boolean;
  /** Names of currently running containers. */
  running: ReadonlySet<string>;
  /** Names of stopped (exited) containers. */
  stopped: ReadonlySet<string>;
};

/**
 * Collected once per reconcile and handed to every {@link Deployable.observe}.
 * Holds per-machine reachability and, for each docker host, the running/stopped
 * container name sets so a deployable can detect itself without re-SSHing.
 */
export type ProbeContext = {
  machines: Record<HomeLabMachine, MachineProbe>;
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
 * `Deployable` that contains child container `Deployable`s; a docker-host
 * install or router config is a leaf `Deployable`. Built by driver factories —
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
   * can deploy. Currently only the network-monitoring stack uses this (it
   * depends on the docker-host and router-config deployables so Docker is
   * installed and NetFlow/syslog export is in place first). Enforced at deploy
   * time — see HomeLabDeployableService.
   */
  dependsOn: string[];
  /**
   * Self-audit: probes where this deployable actually is and in what state,
   * using the shared {@link ProbeContext}. Driver-specific (containers read the
   * probe's docker-ps sets, host setup checks docker info, the router reports
   * reachability).
   */
  observe: (ctx: ProbeContext) => Promise<Observation>;
  /**
   * Re-binds this deployable to a different machine, returning an equivalent
   * `Deployable` whose ops/observe target that machine. Used by the reconciler
   * to tear a misplaced deployable down on the machine it is wrongly running on.
   */
  onMachine: (machine: HomeLabMachine) => Deployable;
};
