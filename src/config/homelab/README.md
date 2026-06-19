# Home Lab

Desired-state config for the home lab. The reconcile engine
(`HomeLabReconcileService`) detects every machine once, asks each deployable to
observe itself against that shared snapshot, diffs observed vs. desired, and
emits a plan that `audit` prints and `deploy`/apply executes.

## Core concepts

| Concept        | What it is                                                                                                                                             | Scope                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| **Deployable** | A single managed unit with a uniform lifecycle (`ops`) and self-audit (`observe`). The thing that gets reconciled.                                     | Per instance (name + machine) |
| **Driver**     | A factory (`create*`) that builds deployables of one kind, supplying the `ops`/`observe` for that kind.                                                | Per `DeployableKind`          |
| **Detector**   | Probes a _machine_ once for capability state (e.g. running containers) and surfaces unmanaged entities. Feeds the snapshot that every `observe` reads. | Per `MachineKind`             |

A driver stamps out deployables; a deployable's `observe` reads the machine
snapshot a detector produced. Deployables and detectors never reference each
other. The snapshot is their only contract, which keeps the reconcile core free
of any single service's concepts (e.g. Docker).

## Layout

- `drivers/`: `createDockerContainer`, `createDockerComposeStack`, `createHostSetup`, `createRouterConfig`
- `detectors/`: per-capability machine probers, assembled in `detectors/index.ts`
- `deployables/`: the actual configured units (single-file, or a folder when they ship co-located assets)
- `machines.ts`: machine inventory (SSH host + `MachineKind`)
- `registry.ts`: top-level + flattened deployable lists
- `types.ts`: the shared vocabulary

## Improvements

`dependsOn` probably needs to be actually typed and reference deployables directly or something. It also needs to be used in the reverse order for teardown.
