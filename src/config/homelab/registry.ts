export * from './types.js';
import { pi1DockerHost, pi2DockerHost } from './deployables/dockerHosts.js';
import { networkMonitoring } from './deployables/network-monitoring/index.js';
import { routerMonitoringLogin } from './deployables/network-monitoring/routerMonitoringLogin.js';
import { pihole, routerDns } from './deployables/pihole/index.js';
import { whoami } from './deployables/whoami/index.js';
import { Deployable } from './types.js';

/**
 * Top-level deployables, selectable as groups in the homelab command.
 */
export const DEPLOYABLES: Deployable[] = [
  pihole,
  routerDns,
  networkMonitoring,
  routerMonitoringLogin,
  pi1DockerHost,
  pi2DockerHost,
  whoami
];

/**
 * Every deployable, flattened to include stack children.
 */
export const ALL_DEPLOYABLES: Deployable[] = DEPLOYABLES.flatMap((d) => [
  d,
  ...d.children
]);

/**
 * Looks up a deployable by name across the flattened registry. Used to resolve
 * `dependsOn` references.
 *
 * @param name the deployable name to find
 */
export function findDeployable(name: string): Deployable | undefined {
  return ALL_DEPLOYABLES.find((d) => d.name === name);
}
