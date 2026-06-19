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
 * Only `deploy` is supported. Initial `observe` reports reachability only. Real
 * `show`-command verification slots in later as just another observe
 * implementation, with no reconciler change.
 *
 * @param params the router-config parameters
 * @param params.name config identity / audit key
 * @param params.label display label for prompts (defaults to `name`)
 * @param params.machine router machine to configure
 * @param params.buildCommands produces the EdgeRouter CLI command list to apply; async because some commands embed values discovered from other machines (e.g. the Pi-hole IP)
 * @param params.dependsOn names of deployables that must be satisfied before this one deploys
 * @param params.opsOverride per-unit overrides shallow-merged over the driver defaults
 */
export function createRouterConfig({
  name,
  label = name,
  machine,
  buildCommands,
  dependsOn = [],
  opsOverride
}: {
  name: string;
  label?: string;
  machine: HomeLabMachine;
  buildCommands: (config: MainScriptsConfig) => string[] | Promise<string[]>;
  dependsOn?: string[];
  opsOverride?: DeployableOps;
}): Deployable {
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
    observe: (ctx: DetectionContext) => {
      const reachable = ctx.machines[machine].reachable;
      return Promise.resolve({
        placements: reachable
          ? [{ machine, state: DeployableState.Configured }]
          : []
      });
    },
    onMachine: (m) =>
      createRouterConfig({
        name,
        label,
        machine: m,
        buildCommands,
        dependsOn,
        opsOverride
      })
  };
}
