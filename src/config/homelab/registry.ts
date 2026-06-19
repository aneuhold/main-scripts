export * from './types.js';
import { pi1DockerHost, pi2DockerHost } from './deployables/dockerHosts.js';
import { networkMonitoring } from './deployables/network-monitoring/index.js';
import { routerNetflow } from './deployables/routerNetflow.js';
import { Deployable, DeployableKind, HomeLabMachine } from './types.js';

/**
 * Top-level deployables, selectable as groups in the homelab command.
 */
export const DEPLOYABLES: Deployable[] = [
  networkMonitoring,
  pi1DockerHost,
  pi2DockerHost,
  routerNetflow
];

/**
 * Every deployable, flattened to include stack children.
 */
export const ALL_DEPLOYABLES: Deployable[] = DEPLOYABLES.flatMap((d) => [
  d,
  ...d.children
]);

/**
 * Returns the container names expected to run on the given machine, derived from
 * the registry (no stored list to keep in sync).
 *
 * @param machine the machine to look up
 */
export function getExpectedContainers(machine: HomeLabMachine): string[] {
  return ALL_DEPLOYABLES.filter(
    (d) => d.kind === DeployableKind.Container && d.machine === machine
  ).map((d) => d.name);
}

/**
 * Looks up a deployable by name across the flattened registry. Used to resolve
 * `dependsOn` references.
 *
 * @param name the deployable name to find
 */
export function findDeployable(name: string): Deployable | undefined {
  return ALL_DEPLOYABLES.find((d) => d.name === name);
}
