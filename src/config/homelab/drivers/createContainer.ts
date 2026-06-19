import DockerService from '../../../services/applications/DockerService.js';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import {
  Deployable,
  DeployableKind,
  DeployableOps,
  DeployableState,
  HomeLabMachine,
  Placement,
  ProbeContext
} from '../types.js';

/**
 * Observes a single container by name across every docker host in the probe
 * context, yielding a placement for each machine it is found running or stopped
 * on. The compose driver aggregates its children's results.
 *
 * @param name container name to look for
 * @param ctx the shared probe context
 */
function observeContainerPlacements(
  name: string,
  ctx: ProbeContext
): Placement[] {
  const placements: Placement[] = [];
  for (const machine of Object.values(HomeLabMachine)) {
    const probe = ctx.machines[machine];
    if (probe.running.has(name)) {
      placements.push({ machine, state: DeployableState.Running });
    } else if (probe.stopped.has(name)) {
      placements.push({ machine, state: DeployableState.Stopped });
    }
  }
  return placements;
}

/**
 * Builds a single-container {@link Deployable} whose lifecycle ops act on one
 * named container (a container is brought up by its stack, so it has no deploy
 * of its own). Self-detects from the shared probe context.
 *
 * @param params the container parameters
 * @param params.name container name / identity / audit key
 * @param params.machine machine the container runs on
 * @param params.dependsOn names of deployables that must be satisfied before this one deploys
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createContainer({
  name,
  machine,
  dependsOn = [],
  opsOverride
}: {
  name: string;
  machine: HomeLabMachine;
  dependsOn?: string[];
  opsOverride?: DeployableOps;
}): Deployable {
  const driverDefaults: DeployableOps = {
    start: () =>
      void HomeLabNetworkService.sshRun(
        machine,
        DockerService.getContainerStartCommand(name)
      ),
    stop: () =>
      void HomeLabNetworkService.sshRun(
        machine,
        DockerService.getContainerStopCommand(name)
      ),
    restart: () =>
      void HomeLabNetworkService.sshRun(
        machine,
        DockerService.getContainerRestartCommand(name)
      ),
    status: () =>
      void HomeLabNetworkService.sshRun(
        machine,
        DockerService.getContainerStatusCommand(name)
      ),
    logs: () =>
      void HomeLabNetworkService.sshRun(
        machine,
        DockerService.getContainerLogsCommand(name)
      )
  };

  return {
    name,
    label: name,
    machine,
    kind: DeployableKind.Container,
    ops: { ...driverDefaults, ...opsOverride },
    children: [],
    dependsOn,
    observe: (ctx) =>
      Promise.resolve({ placements: observeContainerPlacements(name, ctx) }),
    onMachine: (m) =>
      createContainer({ name, machine: m, dependsOn, opsOverride })
  };
}
