import DockerService from '../../../services/applications/DockerService.js';
import HomeLabDockerService from '../../../services/HomeLab/HomeLabDockerService.js';
import {
  Deployable,
  DeployableKind,
  DeployableOps,
  DeployableState,
  DetectionContext,
  HomeLabMachine,
  Placement
} from '../types.js';

/**
 * Observes a single container by name across every docker host in the detection
 * context, yielding a placement for each machine it is found running or stopped
 * on. The compose driver aggregates its children's results.
 *
 * @param name container name to look for
 * @param ctx the shared detection context
 */
function observeContainerPlacements(
  name: string,
  ctx: DetectionContext
): Placement[] {
  const placements: Placement[] = [];
  for (const machine of Object.values(HomeLabMachine)) {
    const { docker } = ctx.machines[machine];
    if (!docker) continue;
    if (docker.running.has(name)) {
      placements.push({ machine, state: DeployableState.Running });
    } else if (docker.stopped.has(name)) {
      placements.push({ machine, state: DeployableState.Stopped });
    }
  }
  return placements;
}

/**
 * Builds a single-container {@link Deployable} whose lifecycle ops act on one
 * named container (a container is brought up by its stack, so it has no deploy
 * of its own). Self-detects from the shared detection context.
 *
 * @param params the container parameters
 * @param params.name container name / identity / audit key
 * @param params.machine machine the container runs on
 * @param params.dependsOn names of deployables that must be satisfied before this one deploys
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createDockerContainer({
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
    start: () => {
      HomeLabDockerService.runIfAvailable(
        machine,
        DockerService.getContainerStartCommand(name)
      );
    },
    stop: () => {
      HomeLabDockerService.runIfAvailable(
        machine,
        DockerService.getContainerStopCommand(name)
      );
    },
    restart: () => {
      HomeLabDockerService.runIfAvailable(
        machine,
        DockerService.getContainerRestartCommand(name)
      );
    },
    status: () => {
      HomeLabDockerService.runIfAvailable(
        machine,
        DockerService.getContainerStatusCommand(name)
      );
    },
    logs: () => {
      HomeLabDockerService.runIfAvailable(
        machine,
        DockerService.getContainerLogsCommand(name)
      );
    }
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
      createDockerContainer({ name, machine: m, dependsOn, opsOverride })
  };
}
