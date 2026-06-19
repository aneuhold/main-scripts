import { DR } from '@aneuhold/core-ts-lib';
import { MainScriptsConfig } from '../../../services/Config.service.js';
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
 * Builds a router-config {@link Deployable}. `deploy` awaits `buildCommands`,
 * prints them, then pipes them over a non-interactive SSH session to the router.
 * Only `deploy` is supported. `observe` reports the deployable configured when
 * `verify` is satisfied, falling back to plain SSH reachability when no `verify`
 * is supplied. Pass a `show`-command-backed `verify` to confirm the config
 * actually landed rather than just that the router answered.
 *
 * @param params the router-config parameters
 * @param params.name config identity / audit key
 * @param params.label display label for prompts (defaults to `name`)
 * @param params.machine router machine to configure
 * @param params.buildCommands produces the EdgeRouter CLI command list to apply; async because some commands embed values discovered from other machines (e.g. the Pi-hole IP)
 * @param params.verify decides whether the config's desired condition actually holds, e.g. by reading back the live router config over SSH; defaults to plain reachability. Only called when the router is reachable
 * @param params.dependsOn names of deployables that must be satisfied before this one deploys
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createRouterConfig({
  name,
  label = name,
  machine,
  buildCommands,
  verify,
  dependsOn = [],
  opsOverride
}: {
  name: string;
  label?: string;
  machine: HomeLabMachine;
  buildCommands: (config: MainScriptsConfig) => string[] | Promise<string[]>;
  verify?: (
    ctx: DetectionContext,
    machine: HomeLabMachine
  ) => boolean | Promise<boolean>;
  dependsOn?: string[];
  opsOverride?: DeployableOps;
}): Deployable {
  const isConfigured =
    verify ??
    ((ctx: DetectionContext, m: HomeLabMachine) => ctx.machines[m].reachable);
  const driverDefaults: DeployableOps = {
    deploy: async (config: MainScriptsConfig) => {
      const commands = await buildCommands(config);
      const script = commands.join('\n');

      DR.logger.info(`Applying router config "${name}" to ${machine}:`);
      DR.logger.info('---');
      DR.logger.info(script);
      DR.logger.info('---');

      const exitCode = await HomeLabNetworkService.sshRunWithInput(
        machine,
        script
      );
      if (exitCode !== 0) {
        DR.logger.error(
          `Router SSH session exited with code ${exitCode}. ` +
            `Apply the commands above manually via: tb connect router`
        );
        process.exit(exitCode);
      }
      DR.logger.info(`Router config "${name}" applied.`);
    }
  };

  return {
    name,
    label,
    machine,
    kind: DeployableKind.Router,
    ops: { ...driverDefaults, ...opsOverride },
    children: [],
    dependsOn,
    observe: async (ctx: DetectionContext) => {
      // An unreachable router can be neither configured nor probed, so skip the
      // verify call (which itself would need to reach the router) entirely.
      if (!ctx.machines[machine].reachable) {
        return { placements: [] };
      }
      const configured = await isConfigured(ctx, machine);
      return {
        placements: configured
          ? [{ machine, state: DeployableState.Configured }]
          : []
      };
    },
    onMachine: (m) =>
      createRouterConfig({
        name,
        label,
        machine: m,
        buildCommands,
        verify,
        dependsOn,
        opsOverride
      })
  };
}
