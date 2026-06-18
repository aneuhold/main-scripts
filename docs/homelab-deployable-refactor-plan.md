# Homelab Deployable Refactor Plan

## Context

The homelab subsystem (added on this branch) works but the **stack** and
**application** concepts aren't composable. Today there are two near-identical
services (`HomeLabStackService`, `HomeLabApplicationService`) doing the same
ops-first dispatch with hand-written defaults, two dispatch branches in the
`homelab` command, and three different "docker" notions floating around. The
router is not modeled at all — it's a free `configureRouter()` function in the
command with hardcoded `if (machine === Router)` special cases. The branch is
also mid-move: `homeLabNetworkMap.ts` imports `./applications/docker.js` but the
file lives at `setup/docker.ts`, so it currently won't build.

**Goal:** collapse everything onto one composable **`Deployable`** concept with a
uniform lifecycle (deploy/start/stop/restart/status/logs/teardown). A stack
becomes a `Deployable` that *contains* child container `Deployable`s. Reusable
**driver** factories supply the default ops; per-unit overrides still win.
Docker-host install and EdgeRouter config become first-class deployables under
the same model. Remote-docker command building is centralized in one place.

A second goal that the type design must support (logic landing immediately
after): turn **audit into desired-state reconciliation** — probe every reachable
machine, diff actual vs. the registry's desired state (including detecting a
deployable running on the *wrong* machine), and produce a structured
**convergence plan**. **`deploy` becomes `apply`**: it runs the same
observe→diff pipeline and executes the plan to make reality match config. `audit`
is simply that pipeline stopped at "print the plan" (a dry run). To make each
deployable able to detect itself (containers via `docker ps`, a docker host via
`docker info`, the router later via `show` commands), each deployable — through
its driver — carries its own `observe` capability; the reconciler owns
orchestration and cross-machine probing.

**Drivers are factories, not deployables:** `composeStack`, `container`,
`hostSetup`, and `routerConfig` are builder functions that each *return* the same
uniform `Deployable`. Their input signatures differ (a compose stack needs
`files`/`services`; the router needs `buildCommands`), but downstream code only
ever sees `Deployable` and never branches on which driver produced it — the
per-kind behavior is captured inside the `ops`/`observe` closures at build time.
The `kind` field is the only breadcrumb, used purely so audit/selection can
reason generically.

**Decided with the user:**
- Unified `Deployable` interface + driver factories (not two parallel types).
- "Merge docker" = centralize *remote* docker command-building only. Local
  `DockerService` (Docker Desktop, in `src/services/applications/`) stays
  untouched.
- Router config is a first-class deployable that shows up in `tb homelab deploy`
  like any other — **no dedicated `configure-router` subcommand and no
  `--router-host` / `--router-user` flags** (the previous extra flag surface is
  removed; the router's address comes from the machine registry).
- `peerDependencies` is **kept** (it's about to be used heavily), but renamed to
  the more explicit `dependsOn`. The router-config deployable is expected to be a
  `dependsOn` of network monitoring very soon.

## Out of Scope / Non-goals

- `src/services/applications/DockerService.ts` and the rest of
  `src/services/applications/` (local GUI-app integrations) are **not** touched.
  Once the `HomeLabApplication` enum is deleted, the naming collision dissolves,
  so no rename there.

---

## Target Shape

### Types (`src/config/homelab/types.ts`)

Keep `HomeLabMachine`. **Delete** `HomeLabApplication`, `HomeLabStack`,
`HomeLabApplicationInfo`, `StackOrAppOps` (container identity becomes a plain
`string` name — the enum value was only ever the container name / audit key).

Add:
- `MachineKind` enum: `DockerHost`, `Router`.
- `MachineInfo` type: `{ sshHost: string; kind: MachineKind }`.
- `DeployableKind` enum: `Compose`, `Container`, `HostSetup`, `Router`. Used by
  audit/selection to reason about a deployable generically (e.g. "which
  containers should run on this machine") without hand-maintained lists.
- `DeployableOps` type: the 7 lifecycle ops. `deploy` is
  `(config: MainScriptsConfig) => void | Promise<void>` (async needed for the
  router's pihole-IP discovery); `logs` takes optional `service`; `teardown`
  takes `removeVolumes`.
- `DeployableOpKey = keyof DeployableOps`.
- `Deployable` type:
  ```
  name: string                       // identity / container name / audit key
  label: string                      // prompt display
  machine: HomeLabMachine
  kind: DeployableKind               // discriminator for audit/selection
  ops: DeployableOps                 // fully resolved (driver default + override)
  supportedOps: ReadonlySet<DeployableOpKey>
  children: Deployable[]             // stack members; [] for leaves
  /**
   * Names of other deployables that must be deployed/satisfied before this one
   * can deploy. Currently only the network-monitoring stack uses this (it will
   * soon depend on the router-config deployable so NetFlow/syslog export is in
   * place first). Enforced at deploy time — see Dependency handling below.
   */
  dependsOn: string[]                // [] when none
  /**
   * Self-audit: probes where this deployable actually is and in what state,
   * using the shared ProbeContext. Driver-specific (containers read docker ps,
   * host setup checks docker info, router runs show commands). See Reconciliation.
   */
  observe: (ctx: ProbeContext) => Promise<Observation>
  /**
   * Re-binds this deployable to a different machine, returning an equivalent
   * Deployable whose ops/observe target that machine. Used by the reconciler to
   * tear a misplaced deployable down on the machine it is *wrongly* running on.
   * Trivial for drivers — they re-invoke themselves with an overridden machine.
   */
  onMachine: (machine: HomeLabMachine) => Deployable
  ```

Note: `expectedContainers` is **not** a stored field — the set of containers
expected on a machine is derived from the registry
(`kind === DeployableKind.Container` filtered by `machine`), so there's one
source of truth and nothing to keep in sync.

**Resolution strategy:** move ops-first dispatch from runtime into the drivers.
Each driver computes a complete `DeployableOps`, then shallow-merges the
caller's `opsOverride`: `{ ...driverDefaults, ...opsOverride }`. The dispatcher
then just calls `target.ops[op](...)` — no branching, no optional ops.

### Machines (`src/config/homelab/machines.ts`)

`MACHINES: Record<HomeLabMachine, MachineInfo>` holding sshHost + kind. Point
`HomeLabNetworkService`'s `MACHINE_SSH` at `MACHINES[m].sshHost` so there's one
source of truth. `sshHost()` and the SSH primitives stay on
`HomeLabNetworkService`.

### Centralized remote docker (`src/services/HomeLab/RemoteDocker.ts`)

New class of **pure** static command-builders (return strings, no side effects)
— the unit-test surface — that replace the duplicated string-building in both
old services and `audit()`:
`composeUp/Stop/Restart/Ps/Logs/Down(remoteDir, …)`,
`containerStart/Stop/Restart/Status/Logs(name)`,
`runningContainers()`, `exitedContainers()`, `dockerInfoCheck()`.
Preserve exact shell-sensitive strings (e.g. `--format '{{.Names}}'`).

### Drivers (`src/config/homelab/drivers/`)

Each is a factory returning a `Deployable`. Drivers call **only**
`HomeLabNetworkService` + `RemoteDocker`.

All driver param objects accept an optional `dependsOn?: string[]` (defaults to
`[]`) and set `kind` appropriately. Every driver also implements `onMachine`
(re-invoke itself with an overridden `machine`) and an `observe` (see
Reconciliation below for the per-kind behavior). These are mechanical and the
same pattern across drivers, so the per-driver notes below only call out the
detection specifics.

- **`composeStack({ name, label?, machine, remoteDir, files, env?, services, dependsOn?, opsOverride? })`**
  → `kind: Compose`.
  - `files: Array<[relativeRemotePath, content]>`; `env?: (config) => Array<[path, content]>`.
  - `deploy`: write every `files` entry + `env?.(config)` via
    `writeRemoteFile`, then `sshRun(composeUp(remoteDir))`. **This is the
    generalized version of the current `networkMonitoring.ops.deploy`** — file
    write + compose-up becomes the *default*, so the network-monitoring config
    supplies data instead of reimplementing the op.
  - `start/stop/restart/status/logs/teardown`: compose commands via `RemoteDocker`.
  - `children`: `services.map((s) => container({ name: s, machine }))` —
    **children inherit the parent's machine**, they don't declare their own.
  - `supportedOps`: all 7.
- **`container({ name, machine, dependsOn?, opsOverride? })`** → `kind: Container`.
  Single-container ops by name. `supportedOps`: start/stop/restart/status/logs
  (no deploy/teardown, matching today's `appCanPerformOp`). `children: []`.
- **`hostSetup({ name, label?, machine, commands, dependsOn?, opsOverride? })`** →
  `kind: HostSetup`. Replaces `setup/docker.ts`. `deploy` runs `commands` over
  SSH. `supportedOps: {deploy}`; other ops are harmless no-ops with a log line.
- **`routerConfig({ name, label?, machine, buildCommands, dependsOn?, opsOverride? })`**
  → `kind: Router`. `buildCommands: (config) => string[] | Promise<string[]>`.
  `deploy` awaits `buildCommands`, then pipes the EdgeRouter CLI commands over
  SSH. `supportedOps: {deploy}`.

### Deployable definitions (`src/config/homelab/deployables/`)

- **`networkMonitoring.ts`** — `composeStack({...})`. Keeps the 4
  `readFileSync(join(CONFIG_DIR, ...))` reads (for `files`) and the `.env`
  builder (for `env`) verbatim, including the `config.homelab?.pihole?.webPassword`
  / `grafana?.adminPassword` lookups with the `changeme` fallback + info log.
  Sets `dependsOn: [dockerHostSetup.name, routerNetflow.name]` — Docker must be
  installed and the router must be exporting NetFlow/syslog before the stack is
  meaningfully deployable.
  **Keep the yaml assets exactly where they are** (`network-monitoring/*.yaml`)
  so `CONFIG_DIR = dirname(fileURLToPath(import.meta.url))` and the build's
  `shx cp -r src/config/homelab lib/config/homelab` keep working — only the
  `index.ts` logic changes.
- **`dockerHostSetup.ts`** — `hostSetup` on `Pi1` running
  `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker neuholda`.
- **`routerNetflow.ts`** — `routerConfig` on `Router`. `buildCommands` contains
  the exact command list from the current `configureRouter()` (flow-accounting /
  netflow / syslog / dhcp-server dns), deriving the pihole IP via
  `HomeLabNetworkService.sshCapture(Pi1, "hostname -I | awk '{print $1}'")`.

### Registry (`src/config/homelab/registry.ts`, replaces `homeLabNetworkMap.ts`)

- `DEPLOYABLES: Deployable[]` = `[networkMonitoring, dockerHostSetup, routerNetflow]`
  (top-level, selectable as groups).
- `ALL_DEPLOYABLES` = `DEPLOYABLES.flatMap((d) => [d, ...d.children])`.
- `getExpectedContainers(machine)` =
  `ALL_DEPLOYABLES.filter((d) => d.kind === DeployableKind.Container && d.machine === machine).map((d) => d.name)`
  (replaces `getExpectedApps`; no stored list).
- `getDockerHostMachines()` driven by `MachineKind.DockerHost` (replaces
  `getMachinesWithApps`).
- `findDeployable(name)` = lookup in `ALL_DEPLOYABLES` (needed for `dependsOn`
  resolution).
- Re-export types. Drop `APPLICATIONS`, `APPLICATION_MACHINE_MAP`,
  `ALL_APPLICATIONS`, `ALL_STACKS`.

### Services (`src/services/HomeLab/`)

- **Delete** `HomeLabStackService.ts` and `HomeLabApplicationService.ts`.
- **Add** `HomeLabDeployableService.ts`: one method
  `run(op, target, config, extraArg?)` that awaits `target.ops[op](...)`,
  passing the right argument per op (config / service / removeVolumes). No
  ops-first branching — ops are pre-resolved.
- `HomeLabNetworkService.ts` stays as the SSH primitive layer.

### Dependency handling (`dependsOn`)

`dependsOn` is enforced **only for the `deploy` op**, in
`HomeLabDeployableService.run`. Before deploying a target, recursively resolve
its `dependsOn` names via `findDeployable`, dedupe, guard against cycles, and
deploy each dependency first (deploys are idempotent: `docker compose up -d`,
re-running `get.docker.com`, re-applying router CLI commands). This gives a
correct ordering for "router/Docker must be ready before network monitoring"
without the user having to deploy pieces by hand. Non-`deploy` ops ignore
`dependsOn`. (The fuller dependency semantics land in the immediate next project;
this provides the field, the wiring, and a working deploy-ordering default now.)

### Reconciliation (audit + apply)

This refactor lands the **types and orchestration skeleton**; the per-kind
detection/convergence logic is written up immediately after (stubbed/minimal
now, but the shapes are complete so nothing needs reshaping).

New types (in `types.ts`):
- `ProbeContext` — collected **once** per reconcile and handed to every
  `observe`. Holds per-machine reachability and, for each `DockerHost`, the
  running/stopped container name sets, plus SSH access so specialized observers
  (the router) can run their own commands. Built by the reconciler using
  `RemoteDocker.runningContainers()/exitedContainers()/dockerInfoCheck()`.
- `Observation` — what one deployable found: `placements: Array<{ machine, state }>`
  where `state` is e.g. `running | stopped | configured | absent`, plus optional
  kind-specific detail. Empty placements ⇒ found nowhere.
- `DriftStatus` enum — `Ok | Stopped | Misplaced | Missing | Unmanaged`.
- `ReconcileItem` — `{ deployable, observation, status: DriftStatus }`.
- `PlannedAction` — a single convergence step: `{ op: 'deploy' | 'teardown' | 'start', deployable, machine }`.
  For a misplacement, the teardown action carries `deployable.onMachine(observedMachine)`.
- `ConvergencePlan` — `{ items: ReconcileItem[]; actions: PlannedAction[] }`,
  with helpers to group actions per machine (`+N add here / -M remove here`).

New service `src/services/HomeLab/HomeLabReconcileService.ts`:
- `buildProbeContext(): Promise<ProbeContext>` — probe all machines once.
- `reconcile(targets?: Deployable[]): Promise<ConvergencePlan>` — for each target
  (default: all top-level `DEPLOYABLES`), call `deployable.observe(ctx)`, compare
  placements against the deployable's desired `machine`, classify `DriftStatus`,
  and emit `PlannedAction`s. Stacks are evaluated as a unit (iterate top-level,
  roll up children) so a moved stack reports as one logical change. Container
  names seen on a machine but matching no registry deployable ⇒ `Unmanaged`.
- `printPlan(plan)` — human-readable report (what `audit` prints).
- `apply(plan)` — execute `actions` in order (respecting `dependsOn` ordering),
  via `HomeLabDeployableService.run`.

Per-kind `observe` (the flexible self-audit the user asked for):
- **Container / Compose** — look the deployable's container name(s) up across all
  `DockerHost` machines in `ctx` ⇒ placements with running/stopped state. A
  compose stack aggregates its children's placements.
- **HostSetup** — desired state is "daemon up": `ctx` docker-info result for its
  machine ⇒ `configured`/`absent`.
- **Router** — *deferred to follow-up*: initial `observe` reports reachability
  only (`configured` if reachable). Real verification (run `show` commands, parse
  config lines) slots in later as just another `observe` implementation — no
  reconciler change. This is the only kind whose detection is intentionally
  incomplete now.

### Command (`src/commands/homelab.ts`)

- `SelectedTarget` union collapses to `Deployable`.
- `selectTarget(op)`: iterate `DEPLOYABLES`; add a `Separator(d.label)` + group
  entry when `d.supportedOps.has(op)`, then (non-teardown) its `children`
  filtered by `supportedOps`. Standalone section disappears (router + docker-host
  are just top-level deployables that surface for `deploy`). `appCanPerformOp` is
  replaced by `d.supportedOps.has(op)`.
- start/stop/restart/status/logs/teardown cases become
  `const target = await selectTarget(op); await HomeLabDeployableService.run(op, target, config, …)`.
  `logs` prompts for a service from `target.children.map((c) => c.name)`.
  `runTeardown` keeps the type-the-hostname confirm flow, using `target.machine`
  and `getExpectedContainers(target.machine)` for the "Containers:" line.
- **`deploy` = apply** (reconcile, not just push): build a `ConvergencePlan` via
  `HomeLabReconcileService.reconcile(targets)` (targets = the selected deployable,
  or all), show the plan, confirm, then `apply(plan)`. This subsumes the old
  "write files + compose up" — that's now just the `deploy` action the plan emits
  for a missing/misplaced deployable, plus a `teardown` action on any machine it's
  wrongly running on.
- **`audit` = deploy's dry run**: `reconcile()` over all `DEPLOYABLES` then
  `printPlan()` — same pipeline, no execution. The old per-machine
  `if (machine === Router)` / `getExpectedContainers` loop is replaced by the
  reconciler (router skipped via `MachineKind`, container expectations derived in
  `observe`).
- **Remove all dedicated router machinery**: delete the `configureRouter()` free
  function, the `ConfigureRouter` subcommand enum value, and the
  `routerHost` / `routerUser` parameters on `homelab()`. The router is configured
  by selecting it under `tb homelab deploy` like any other deployable; its SSH
  address comes from `MACHINES[Router].sshHost`.
- `src/index.ts`: drop the `--router-host` and `--router-user` options from the
  `homelab` command and the `configure-router` reference in its description; the
  action collapses to `await homelab(subcommand)`.
- `connect.ts`: only its `HomeLabMachine` import path changes
  (`homeLabNetworkMap.js` → `registry.js`); behavior unchanged.

---

## Steps (each independently compilable)

1. Add `RemoteDocker.ts` (pure builders + thin executors) and its spec.
2. Rewrite `types.ts`: add `MachineKind` / `MachineInfo` / `DeployableKind` /
   `DeployableOps` / `Deployable` (incl. `observe` + `onMachine`) and the
   reconciliation types (`ProbeContext`, `Observation`, `DriftStatus`,
   `ReconcileItem`, `PlannedAction`, `ConvergencePlan`); keep `HomeLabMachine`.
   Temporarily keep the old stack/application exports so existing files compile.
3. Add `machines.ts`; point `HomeLabNetworkService.MACHINE_SSH` at it.
4. Add the four drivers under `drivers/` (each with `ops`, `observe`, `onMachine`).
5. Add `deployables/networkMonitoring.ts` (rewrite of `network-monitoring/index.ts`),
   `deployables/dockerHostSetup.ts`, `deployables/routerNetflow.ts`.
6. Add `registry.ts` with `DEPLOYABLES` + helpers.
7. Add `HomeLabDeployableService.ts` (dispatcher + `dependsOn` ordering).
8. Add `HomeLabReconcileService.ts` (probe context, `reconcile`, `printPlan`,
   `apply`) — with per-kind `observe`/convergence logic minimal/stubbed but the
   types complete.
9. Switch `homelab.ts` (`deploy` = apply, `audit` = dry run) and `connect.ts` to
   the registry + services.
10. Delete dead code: `HomeLabStackService.ts`, `HomeLabApplicationService.ts`,
    `setup/docker.ts`, `homeLabNetworkMap.ts`, and the legacy type exports from
    `types.ts`. The broken `./applications/docker.js` import disappears with it.
11. Validate (below).

## Edge Cases / Risks

- **Compose deploy duplicating default deploy** — avoided: file-write + compose-up
  is the driver default; the stack supplies `files`/`env` as data.
- **Child machine inheritance** — `composeStack` must inject the parent machine
  into each `container(...)`; lock with a unit test.
- **Async deploy** — `DeployableOps.deploy` is `void | Promise<void>`; the
  dispatcher `await`s it (router needs IP discovery).
- **Asset paths** — keep yaml under `src/config/homelab/...` co-located with the
  module reading it via `fileURLToPath`; `pnpm build` must still ship them.
- **Shell quoting** — preserve exact `--format`/inspect strings in `RemoteDocker`.
- **Probe once, observe many** — collect `docker ps`/`docker info` per machine a
  single time into `ProbeContext`; deployables interpret that shared state rather
  than each re-SSHing (a 5-container stack must not run `docker ps` 5×). The
  router may still issue its own commands via the context's SSH access.
- **Acting on misplaced deployables** — converging a move means teardown on the
  *observed* (wrong) machine + deploy on the desired one; the reconciler builds
  the teardown action from `deployable.onMachine(observedMachine)` since `machine`
  is otherwise baked into a deployable's closures at construction.
- **Apply is destructive** — `deploy`/apply can tear down containers (e.g. on a
  machine move). Always show the plan and confirm before executing; reuse the
  existing type-the-hostname guard for teardown actions.

## Resolved Decisions

1. **`peerDependencies` → `dependsOn`** — kept and made explicit. Renamed to
   `dependsOn: string[]` with a doc comment, enforced as deploy-ordering (see
   Dependency handling). `networkMonitoring` declares the router and docker-host
   deployables as dependencies.
2. **Router** — no dedicated subcommand or flags. It's a normal deployable
   reachable via `tb homelab deploy`.
3. **Audit = desired-state reconciliation; `deploy` = apply.** Both run the same
   observe→diff pipeline (`HomeLabReconcileService.reconcile`); `audit` prints the
   `ConvergencePlan`, `deploy` executes it. Detects misplacement across machines.
4. **Self-auditing deployables.** Each deployable carries an `observe` (driver-
   provided) so it knows how to detect itself; the reconciler owns cross-machine
   probing via a shared `ProbeContext`. Router config verification is deferred
   (initial `observe` = reachability only).
5. **Scope split.** This refactor lands the unified model, drivers, dispatcher,
   command wiring, **and the full reconciliation type surface + service
   skeleton**. The per-kind detection/convergence *logic* (and richer router
   verification) is the immediate follow-up — no reshaping required.

## Validation

- `pnpm lint --fix`
- `pnpm check` (`tsc --noEmit`)
- `pnpm test` (`vitest run`)
- `pnpm build` once — confirm `shx cp -r` ships the yaml and runtime
  `readFileSync` paths still resolve.
- New unit tests (co-located, following `GitService.spec.ts` + the
  `vi.mock('@aneuhold/core-ts-lib')` logger stub pattern):
  - `RemoteDocker.spec.ts` — assert exact command strings (no SSH, no mocks).
  - Optional `composeStack` test mocking `HomeLabNetworkService` to verify the
    deploy file-write→compose-up sequence and child-machine inheritance.
  - `HomeLabReconcileService` test with a hand-built `ProbeContext` (no SSH):
    feed a fake actual-state and assert the `ConvergencePlan` — e.g. a stack
    desired on Pi2 but observed on Pi1 yields `Misplaced` + teardown-on-Pi1 /
    deploy-on-Pi2 actions. Exercises `observe`/`onMachine` purely.
