import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import {
  Deployable,
  DeployableKind,
  DeployableOps,
  DeployableState,
  DetectionContext,
  HomeLabMachine
} from '../types.js';

/**
 * Builds a host-setup {@link Deployable} — a one-shot provisioning step (e.g.
 * installing a daemon) run over SSH, with `deploy` as its only action.
 * Self-detects its desired condition from the shared detection context.
 *
 * @param params the host-setup parameters
 * @param params.name setup identity / audit key
 * @param params.label display label for prompts (defaults to `name`)
 * @param params.machine machine to run the setup commands on
 * @param params.commands shell commands run (joined with `&&`) over SSH on deploy
 * @param params.verify decides from the detection context whether the setup's desired condition holds; defaults to plain SSH reachability. Pass a capability-aware check (e.g. "docker is up") to keep that coupling in the config, not the driver
 * @param params.dependsOn names of deployables that must be satisfied before this one deploys
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createHostSetup({
  name,
  label = name,
  machine,
  commands,
  verify,
  dependsOn = [],
  opsOverride
}: {
  name: string;
  label?: string;
  machine: HomeLabMachine;
  commands: string[];
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
      const exitCode = await HomeLabNetworkService.sshRun(
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
    }
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
        verify,
        dependsOn,
        opsOverride
      })
  };
}
