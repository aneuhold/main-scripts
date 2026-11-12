import { DR } from '@aneuhold/core-ts-lib';
import { MainScriptsConfig } from '../../../../services/Config.service.js';
import HomeLabNetworkService from '../../../../services/HomeLab/HomeLabNetwork.service.js';
import {
  createRouterConfig,
  createRouterConfigGuardedDeletes
} from '../../drivers/createRouterConfig.js';
import { HomeLabMachine } from '../../types.js';

/**
 * Router login the network-monitoring stack authenticates with. Operator level,
 * since the stack only reads stats.
 */
export const MONITORING_ROUTER_USER = 'monitoring';

/**
 * Returns the monitoring login's router password from the user config, exiting
 * when it is unset or unusable. There is no placeholder fallback because the
 * value becomes a real router login.
 *
 * @param config the loaded user config
 */
export const getMonitoringRouterPassword = (
  config: MainScriptsConfig
): string => {
  const password = config.homelab?.networkMonitoring?.routerPassword;
  if (!password) {
    DR.logger.error(
      'homelab.networkMonitoring.routerPassword not set in ~/.config/tb-main-scripts.json.'
    );
    process.exit(1);
  }
  if (password.includes("'")) {
    DR.logger.error(
      'homelab.networkMonitoring.routerPassword cannot contain a single quote.'
    );
    process.exit(1);
  }
  return password;
};

/**
 * EdgeRouter config for the operator login the network-monitoring stack reads
 * Traffic Analysis stats with.
 *
 * The Traffic Analysis mode itself is left to the router UI. Any mode other than
 * "Disabled" feeds the stack, and both of them keep working with hardware
 * offload (`system offload hwnat`) on the ER-X's MediaTek platform, unlike
 * NetFlow, which needs offload disabled and caps routing near 300 Mbps:
 * https://help.uisp.com/hc/en-us/articles/22591077433879-EdgeRouter-Hardware-Offloading
 */
export const routerMonitoringLogin = createRouterConfig({
  name: 'router-monitoring-login',
  label: 'router login for network monitoring',
  machine: HomeLabMachine.Router,
  verify: async () => {
    const { exitCode } = await HomeLabNetworkService.sshCapture(
      HomeLabMachine.Router,
      `cli-shell-api existsActive system login user ${MONITORING_ROUTER_USER}`
    );
    return exitCode === 0;
  },
  teardownCommands: () => [
    'configure',
    ...createRouterConfigGuardedDeletes([
      `system login user ${MONITORING_ROUTER_USER}`
    ]),
    'commit',
    'save',
    'exit'
  ],
  buildCommands: (config) => [
    'configure',
    `set system login user ${MONITORING_ROUTER_USER} authentication plaintext-password '${getMonitoringRouterPassword(config)}'`,
    `set system login user ${MONITORING_ROUTER_USER} level operator`,
    'commit',
    'save',
    'exit'
  ]
});
