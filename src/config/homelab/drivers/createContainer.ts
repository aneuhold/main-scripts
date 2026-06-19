import { DR } from '@aneuhold/core-ts-lib';
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
  /**
   * Runs a single-container command on the machine, but only after confirming
   * Docker is available there. If it is not, prints a hint and skips the command
   * rather than surfacing a raw "docker: command not found" error.
   *
   * @param command the docker command to run
   */
  const runWithDocker = (command: string): void => {
    const dockerCheck = HomeLabNetworkService.sshCapture(
      machine,
      DockerService.getDockerInfoCheckCommand()
    );
    if (dockerCheck.output !== 'ok') {
      DR.logger.info(
        `Docker is not available on ${machine} — ` +
          'run "tb homelab deploy" to set up the Docker host first.'
      );
      return;
    }
    HomeLabNetworkService.sshRun(machine, command);
  };

  const driverDefaults: DeployableOps = {
    start: () => {
      runWithDocker(DockerService.getContainerStartCommand(name));
    },
    stop: () => {
      runWithDocker(DockerService.getContainerStopCommand(name));
    },
    restart: () => {
      runWithDocker(DockerService.getContainerRestartCommand(name));
    },
    status: () => {
      runWithDocker(DockerService.getContainerStatusCommand(name));
    },
    logs: () => {
      runWithDocker(DockerService.getContainerLogsCommand(name));
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
      createContainer({ name, machine: m, dependsOn, opsOverride })
  };
}
