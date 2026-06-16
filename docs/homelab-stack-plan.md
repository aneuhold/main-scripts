# Home Lab Stack Architecture Plan

## Goals

- Define stacks and applications as first-class typed objects
- Both share the same `StackOrAppOps` type — generic dispatch, minimal code
- Derive `APPLICATION_MACHINE_MAP` dynamically from stack definitions — no manual sync
- Centralize stack operations in `HomeLabStackService`; app operations in `HomeLabApplicationService`
- Smart deploy: detect an already-deployed stack/app and abort rather than re-deploying blindly
- Add teardown: bring a stack or app fully down (optionally wiping volumes)
- Prompt for all required inputs — nothing silently assumes a default

---

## Unified Ops Type

Both stacks and individual applications share the same ops shape. Ops are closures — they
already capture their context (machine, remoteDir, etc.) at definition time, so no
stack/app is passed as an argument. Only external config that isn't known at definition
time (e.g. passwords) is passed in.

```typescript
type StackOrAppOps = {
  deploy?: (config: MainScriptsConfig) => void;
  teardown?: (removeVolumes: boolean) => void;
  start?: () => void;
  stop?: () => void;
  restart?: () => void;
  status?: () => void;
  logs?: (service?: string) => void;
};
```

---

## `HomeLabStack`

```typescript
type HomeLabStack = {
  /** Human-readable name used in CLI output and prompts. */
  name: string;
  /** Machine that hosts this stack. */
  machine: HomeLabMachine;
  /** Remote directory where docker-compose.yaml and config files are deployed. */
  remoteDir: string;
  /** Applications that make up this stack. */
  applications: HomeLabApplication[];
  /**
   * Applications from other stacks that must already be running before this
   * stack can be deployed. The deploy flow checks these and aborts with a
   * message telling the user which stack to deploy first.
   */
  peerDependencies: HomeLabApplication[];
  ops?: StackOrAppOps;
};
```

### `ALL_STACKS`

```typescript
export const ALL_STACKS = {
  networkMonitoring: {
    name: 'network monitoring',
    machine: HomeLabMachine.Pi1,
    remoteDir: '~/monitoring',
    applications: [
      HomeLabApplication.Pihole,
      HomeLabApplication.Ntopng,
      HomeLabApplication.Loki,
      HomeLabApplication.Promtail,
      HomeLabApplication.Grafana,
    ],
    peerDependencies: [],
  },
} satisfies Record<string, HomeLabStack>;
```

---

## `HomeLabApplicationEntry` and `APPLICATIONS`

Every application is defined once in `APPLICATIONS`. Stacks reference apps by enum id;
services resolve to the full entry when they need ops or metadata.

```typescript
type HomeLabApplicationInfo = {
  id: HomeLabApplication;
  ops?: StackOrAppOps;
};

export const APPLICATIONS = {
  [HomeLabApplication.Docker]: {
    id: HomeLabApplication.Docker,
    ops: {
      deploy: () => {
        HomeLabService.sshRun(
          HomeLabMachine.Pi1,
          'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker neuholda'
        );
      },
    },
  },
  [HomeLabApplication.Pihole]: { id: HomeLabApplication.Pihole },
  [HomeLabApplication.Ntopng]: { id: HomeLabApplication.Ntopng },
  [HomeLabApplication.Loki]:   { id: HomeLabApplication.Loki },
  [HomeLabApplication.Promtail]: { id: HomeLabApplication.Promtail },
  [HomeLabApplication.Grafana]: { id: HomeLabApplication.Grafana },
} satisfies Record<HomeLabApplication, HomeLabApplicationInfo>;
```

`Docker` is a standalone application (not part of any stack). Its ops closure captures the
target machine directly. It is a system service, not a Docker container, so
`HomeLabApplicationService.isRunning` checks it via `docker info` rather than a container
name lookup.

---

## `HomeLabApplication` Enum Update

Add `Docker` as the first entry (standalone; no stack membership):

```typescript
export enum HomeLabApplication {
  Docker   = 'docker',   // system service — not a container
  Pihole   = 'pihole',
  Ntopng   = 'ntopng',
  Loki     = 'loki',
  Promtail = 'promtail',
  Grafana  = 'grafana',
}
```

---

## `APPLICATION_MACHINE_MAP` — Derived

```typescript
export const APPLICATION_MACHINE_MAP: Partial<Record<HomeLabApplication, HomeLabMachine>> =
  Object.fromEntries(
    Object.values(ALL_STACKS).flatMap((stack) =>
      stack.applications.map((app): [HomeLabApplication, HomeLabMachine] => [app, stack.machine])
    )
  );

export const ALL_APPLICATIONS: HomeLabApplication[] = Object.values(ALL_STACKS)
  .flatMap<HomeLabApplication>((stack) => stack.applications);
```

Helpers (`getMachineForApp`, `getExpectedApps`, etc.) belong in `HomeLabApplicationService`
— add only if they make call sites meaningfully cleaner.

---

## Prompts and Target Selection

`tb homelab` with no arguments → menu of all subcommands.

When a subcommand needs a target, the prompt groups stacks and their member apps, with
standalone apps (not in any stack) listed separately. Only targets that have the
requested op are shown.

```
? Select a target  (restart)
  ❯ Network Monitoring          ← whole stack
      Pihole
      Ntopng
      ...
    Docker                      ← standalone (has deploy, no restart → not shown here)
```

The prompt list is built by filtering `APPLICATIONS[app].ops?.[opKey]` for individual
apps and checking `stack.ops?.[opKey]` for stacks. If neither has the op, the service
falls back to its default implementation — so stacks always appear even without explicit ops.

---

## Service Dispatch Pattern

Both `HomeLabStackService` and `HomeLabApplicationService` follow the same pattern:
call the ops override if present, otherwise run the default implementation. Since ops
are closures, the service just calls through — no target is forwarded.

```typescript
// HomeLabStackService
static restart(stack: HomeLabStack): void {
  if (stack.ops?.restart) {
    stack.ops.restart();
    return;
  }
  // default: ssh docker compose restart
  HomeLabService.sshRun(stack.machine, `cd ${stack.remoteDir} && docker compose restart`);
}

// HomeLabApplicationService
static restart(entry: HomeLabApplicationInfo): void {
  if (entry.ops?.restart) {
    entry.ops.restart();
    return;
  }
  // default: ssh docker restart <containerName>
  const machine = APPLICATION_MACHINE_MAP[entry.id];
  if (!machine) throw new Error(`${entry.id} is not assigned to any machine`);
  HomeLabService.sshRun(machine, `docker restart ${entry.id}`);
}
```

---

## Teardown Confirmation

```
About to tear down "network monitoring" on pi3-bplus-1:
  Containers: pihole, ntopng, loki, promtail, grafana

Also remove volumes? (y/N): y
  Volumes to delete: pihole-data, grafana-data

Type the machine hostname to confirm: _
```

Any input other than the exact hostname aborts with no action.

---

## File Structure

```
src/
  config/
    homelab/
      homeLabNetworkMap.ts              ← enums, StackOrAppOps, HomeLabStack,
                                            HomeLabApplicationEntry, ALL_STACKS,
                                            APPLICATIONS, APPLICATION_MACHINE_MAP
      network-monitoring/
        docker-compose.yaml
        loki/loki-config.yaml
        promtail/promtail-config.yaml
        grafana/provisioning/datasources/datasources.yaml
  services/
    HomeLab/
      HomeLabService.ts                 ← low-level SSH helpers
      HomeLabStackService.ts            ← stack-level ops; ops-first dispatch
      HomeLabApplicationService.ts      ← per-app ops; ops-first dispatch; isRunning;
                                            firstFailingPeerDep; optional map helpers
    applications/
      DockerService.ts                  ← existing; docker-level helpers
  commands/
    homelab.ts                          ← thin CLI layer; grouped target prompt;
                                            dispatch to stack or app service
```

---

## `homelab.ts` Subcommands

| Subcommand | Prompt flow |
|---|---|
| `deploy` | select target (stack or app with deploy op, or stack default) → service deploy |
| `start` | select target → service start |
| `stop` | select target → service stop |
| `restart` | select target → service restart |
| `status` | select target → service status |
| `logs` | select target → select service ("all" or named) → service logs |
| `teardown` | select stack → confirm volumes → confirm hostname → service teardown |
| `configure-router` | unchanged |
| `audit` | unchanged structure |
