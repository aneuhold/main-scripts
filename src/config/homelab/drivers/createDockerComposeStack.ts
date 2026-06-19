import { DR } from '@aneuhold/core-ts-lib';
import { MainScriptsConfig } from '../../../services/ConfigService.js';
import DockerService from '../../../services/applications/DockerService.js';
import HomeLabDockerService from '../../../services/HomeLab/HomeLabDockerService.js';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import {
  Deployable,
  DeployableKind,
  DeployableOps,
  DeployableState,
  DetectionContext,
  HomeLabMachine,
  Placement
} from '../types.js';
import { createDockerContainer } from './createDockerContainer.js';
import { dockerHostSetupName } from './createDockerHostSetup.js';

/**
 * A remote file to write during deploy: `[remotePath, content]`.
 */
export type RemoteFile = [string, string];

/**
 * Collapses per-child placements into one placement per machine, reporting a
 * machine as Stopped if any child there is stopped, otherwise Running.
 *
 * @param childPlacements the flattened placements from every child
 */
function aggregatePlacements(childPlacements: Placement[]): Placement[] {
  const byMachine = new Map<HomeLabMachine, DeployableState>();
  for (const { machine, state } of childPlacements) {
    const existing = byMachine.get(machine);
    if (existing === DeployableState.Stopped) continue;
    byMachine.set(machine, state);
  }
  return [...byMachine].map(([machine, state]) => ({ machine, state }));
}

/**
 * Builds a multi-container compose-stack {@link Deployable}. The default
 * `deploy` writes every `files` entry plus the config-derived `env` files, then
 * runs `docker compose up -d` — so a stack supplies data instead of
 * reimplementing the op. Children are containers that inherit the stack's
 * machine. Self-detects by aggregating its children's observations.
 *
 * @param params the compose-stack parameters
 * @param params.name stack identity / audit key
 * @param params.label display label for prompts (defaults to `name`)
 * @param params.machine machine that hosts the stack
 * @param params.remoteDir remote directory holding the compose file and config files
 * @param params.files static config files written verbatim on deploy
 * @param params.env config-derived files (e.g. a generated `.env`) written on deploy
 * @param params.services container/service names that make up the stack
 * @param params.dependsOn extra deployables that must be satisfied before this one deploys; the docker-host setup is always prepended (every compose stack needs Docker installed first), so callers only list additional prerequisites
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createDockerComposeStack({
  name,
  label = name,
  machine,
  remoteDir,
  files,
  env,
  services,
  dependsOn = [],
  opsOverride
}: {
  name: string;
  label?: string;
  machine: HomeLabMachine;
  remoteDir: string;
  files: RemoteFile[];
  env?: (config: MainScriptsConfig) => RemoteFile[];
  services: string[];
  dependsOn?: string[];
  opsOverride?: DeployableOps;
}): Deployable {
  const children = services.map((service) =>
    createDockerContainer({ name: service, machine })
  );

  // Every compose stack needs the Docker host installed first, so prepend the
  // host setup for this machine (deduped) — stack configs only declare their
  // additional prerequisites.
  const resolvedDependsOn = [
    ...new Set([dockerHostSetupName(machine), ...dependsOn])
  ];

  const driverDefaults: DeployableOps = {
    deploy: async (config: MainScriptsConfig) => {
      const allFiles: RemoteFile[] = [...files, ...(env ? env(config) : [])];

      DR.logger.info(`Writing ${name} config files to ${machine}...`);
      for (const [path, content] of allFiles) {
        DR.logger.info(`  Writing ${path}`);
        if (!HomeLabNetworkService.writeRemoteFile(machine, path, content)) {
          process.exit(1);
        }
      }

      DR.logger.info(`Starting ${name}...`);
      const upCode = await HomeLabNetworkService.sshRun(
        machine,
        DockerService.getComposeUpCommand(remoteDir)
      );
      if (upCode !== 0) {
        DR.logger.error(`docker compose up failed (exit ${upCode})`);
        process.exit(upCode);
      }
      DR.logger.info(`${name} is up!`);
    },
    teardown: (removeVolumes) =>
      HomeLabDockerService.runIfDeployed(
        machine,
        remoteDir,
        DockerService.getComposeDownCommand(remoteDir, removeVolumes)
      ),
    start: () =>
      HomeLabDockerService.runIfDeployed(
        machine,
        remoteDir,
        DockerService.getComposeUpCommand(remoteDir)
      ),
    stop: () =>
      HomeLabDockerService.runIfDeployed(
        machine,
        remoteDir,
        DockerService.getComposeStopCommand(remoteDir)
      ),
    restart: () =>
      HomeLabDockerService.runIfDeployed(
        machine,
        remoteDir,
        DockerService.getComposeRestartCommand(remoteDir)
      ),
    status: () =>
      HomeLabDockerService.runIfDeployed(
        machine,
        remoteDir,
        DockerService.getComposePsCommand(remoteDir)
      ),
    logs: (service) =>
      HomeLabDockerService.runIfDeployed(
        machine,
        remoteDir,
        DockerService.getComposeLogsCommand(remoteDir, service)
      )
  };

  return {
    name,
    label,
    machine,
    kind: DeployableKind.Compose,
    ops: { ...driverDefaults, ...opsOverride },
    children,
    dependsOn: resolvedDependsOn,
    observe: async (ctx: DetectionContext) => {
      const childObservations = await Promise.all(
        children.map((child) => child.observe(ctx))
      );
      const placements = aggregatePlacements(
        childObservations.flatMap((o) => o.placements)
      );
      return { placements };
    },
    onMachine: (m) =>
      createDockerComposeStack({
        name,
        label,
        machine: m,
        remoteDir,
        files,
        env,
        services,
        dependsOn,
        opsOverride
      })
  };
}
