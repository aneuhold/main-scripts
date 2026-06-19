---
name: homelab
description: Loads home lab context (network topology, hardware inventory, and the desired-state reconcile engine) for any work touching the home lab.
---

# Home Lab Context

You are working on the home lab. Center your context on the home network and the
desired-state config that manages it.

## Read these first

Read both of these before doing anything else. They hold the bulk of the context:

- `docs/home-network-setup.md`: network equipment, hardware inventory, SSH access
- `src/config/homelab/README.md`: reconcile engine concepts and config layout

## Where the code lives

- `src/config/homelab/`: desired-state config (drivers, detectors, deployables, `machines.ts`, `registry.ts`, `types.ts`)
- `src/services/HomeLab/`: the services: `HomeLabReconcileService` (detect, observe, diff, plan), plus `HomeLabDeployableService`, `HomeLabDockerService`, `HomeLabNetworkService`

$ARGUMENTS
