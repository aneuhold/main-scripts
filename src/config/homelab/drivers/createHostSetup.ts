import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetwork.service.js';
import {
  Deployable,
  DeployableKind,
  DeployableOps,
  DeployableState,
  DetectionContext,
  HomeLabMachine
} from '../types.js';

/**
 * Builds a host-setup {@link Deployable}, a one-shot provisioning step (e.g.
 * installing a daemon) run over an interactive SSH session, with `deploy` as its
 * only action. The interactive session lets remote prompts like `sudo` reach the
 * user. Self-detects its desired condition from the shared detection context.
 *
 * @param params the host-setup parameters
 * @param params.name setup identity / audit key
 * @param params.label display label for prompts (defaults to `name`)
 * @param params.machine machine to run the setup commands on
 * @param params.commands shell commands run (joined with `&&`) over an interactive SSH session on deploy
 * @param params.teardownCommands builds the shell commands that reverse the setup, given whether persistent data should also be removed. When omitted the setup exposes no `teardown` op. Run (joined with `&&`) over an interactive SSH session
 * @param params.verify decides from the detection context whether the setup's desired condition holds; defaults to plain SSH reachability. Pass a capability-aware check (e.g. "docker is up") to keep that coupling in the config, not the driver
 * @param params.dependsOn names of deployables that must be satisfied before this one deploys
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createHostSetup({
  name,
  label = name,
  machine,
  commands,
  teardownCommands,
  verify,
  dependsOn = [],
  opsOverride
}: {
  name: string;
  label?: string;
  machine: HomeLabMachine;
  commands: string[];
  teardownCommands?: (removeVolumes: boolean) => string[];
  verify?: (ctx: DetectionContext, machine: HomeLabMachine) => boolean;
  dependsOn?: string[];
  opsOverride?: DeployableOps;
}): Deployable {
  const isConfigured =
    verify ??
    ((ctx: DetectionContext, m: HomeLabMachine) => ctx.machines[m].reachable);

  const driverDefaults: DeployableOps = {
    deploy: async () => {
      DR.logger.info(`Running host setup "${name}" on ${machine}...`);
      const exitCode = await HomeLabNetworkService.sshRunInteractive(
        machine,
        commands.join(' && ')
      );
      if (exitCode !== 0) {
        DR.logger.error(
          `Host setup "${name}" failed on ${machine} (exit ${exitCode})`
        );
        process.exit(exitCode);
      }
      DR.logger.info(`Host setup "${name}" complete on ${machine}.`);
    },
    ...(teardownCommands && {
      teardown: async (removeVolumes: boolean) => {
        DR.logger.info(`Tearing down host setup "${name}" on ${machine}...`);
        const exitCode = await HomeLabNetworkService.sshRunInteractive(
          machine,
          teardownCommands(removeVolumes).join(' && ')
        );
        if (exitCode !== 0) {
          DR.logger.error(
            `Teardown of "${name}" failed on ${machine} (exit ${exitCode})`
          );
          process.exit(exitCode);
        }
        DR.logger.info(`Teardown of "${name}" complete on ${machine}.`);
      }
    })
  };

  return {
    name,
    label,
    machine,
    kind: DeployableKind.HostSetup,
    ops: { ...driverDefaults, ...opsOverride },
    children: [],
    dependsOn,
    observe: (ctx: DetectionContext) => {
      const configured = isConfigured(ctx, machine);
      return Promise.resolve({
        placements: configured
          ? [{ machine, state: DeployableState.Configured }]
          : []
      });
    },
    onMachine: (m) =>
      createHostSetup({
        name,
        label,
        machine: m,
        commands,
        teardownCommands,
        verify,
        dependsOn,
        opsOverride
      })
  };
}
