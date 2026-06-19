import HomeLabDockerService from '../../../services/HomeLab/HomeLabDocker.service.js';
import { createDockerContainer } from '../drivers/createDockerContainer.js';
import { ALL_DEPLOYABLES } from '../registry.js';
import {
  DeployableKind,
  DeployableState,
  DriftStatus,
  HomeLabMachine,
  MachineCapabilityDetector,
  MachineKind,
  MachineSnapshot,
  ReconcileItem
} from '../types.js';

/**
 * Detects the Docker daemon on a docker-host machine, returning the running and
 * stopped container name sets. Returns no docker state if the daemon is
 * unreachable or down. The single place that knows how to interrogate Docker
 * over SSH.
 *
 * @param machine the docker-host machine to inspect
 */
const detectDockerHost = async (
  machine: HomeLabMachine
): Promise<Partial<MachineSnapshot>> => {
  if (!(await HomeLabDockerService.isAvailable(machine))) return {};
  const [running, stopped] = await Promise.all([
    HomeLabDockerService.runningContainers(machine),
    HomeLabDockerService.exitedContainers(machine)
  ]);
  return { docker: { running, stopped } };
};

/**
 * Reports containers found on a docker host that match no container deployable
 * in the registry, as {@link DriftStatus.Unmanaged} reconcile items.
 *
 * @param machine the docker host the containers were found on
 * @param snapshot that machine's detected state
 */
const findUnmanagedContainers = (
  machine: HomeLabMachine,
  snapshot: MachineSnapshot
): ReconcileItem[] => {
  const { docker } = snapshot;
  if (!docker) return [];

  const managed = new Set(
    ALL_DEPLOYABLES.filter((d) => d.kind === DeployableKind.Container).map(
      (d) => d.name
    )
  );
  const items: ReconcileItem[] = [];
  for (const name of [...docker.running, ...docker.stopped]) {
    if (managed.has(name)) continue;
    const state = docker.running.has(name)
      ? DeployableState.Running
      : DeployableState.Stopped;
    items.push({
      deployable: createDockerContainer({ name, machine }),
      observation: { placements: [{ machine, state }] },
      status: DriftStatus.Unmanaged
    });
  }
  return items;
};

/**
 * The Docker-host capability: contributes the running/stopped container snapshot
 * to a machine's detected state and reports stray (unmanaged) containers. All
 * Docker coupling for reconciliation lives here, keyed off
 * {@link MachineKind.DockerHost}.
 */
export const dockerHostDetector: MachineCapabilityDetector = {
  appliesTo: [MachineKind.DockerHost],
  detect: detectDockerHost,
  findUnmanaged: findUnmanagedContainers
};
