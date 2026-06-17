export * from './types.js';
import { networkMonitoring } from './network-monitoring/index.js';
import { dockerApplication } from './applications/docker.js';
import {
  HomeLabApplication,
  HomeLabApplicationInfo,
  HomeLabMachine,
  HomeLabStack
} from './types.js';

export const ALL_STACKS = {
  networkMonitoring
} satisfies Record<string, HomeLabStack>;

/**
 * All applications defined in the home lab, keyed by their enum id.
 * Standalone apps (not belonging to any stack) define their ops here
 * since they have no stack to provide defaults.
 */
export const APPLICATIONS: Record<HomeLabApplication, HomeLabApplicationInfo> =
  {
    [HomeLabApplication.Docker]: dockerApplication,
    [HomeLabApplication.Pihole]: { id: HomeLabApplication.Pihole },
    [HomeLabApplication.Ntopng]: { id: HomeLabApplication.Ntopng },
    [HomeLabApplication.Loki]: { id: HomeLabApplication.Loki },
    [HomeLabApplication.Promtail]: { id: HomeLabApplication.Promtail },
    [HomeLabApplication.Grafana]: { id: HomeLabApplication.Grafana }
  };

/**
 * Maps each stack-member application to the machine that hosts it.
 * Derived from {@link ALL_STACKS} — update the stack definition to move an
 * app to a different machine. Standalone apps (e.g. Docker) are absent.
 */
export const APPLICATION_MACHINE_MAP: Partial<
  Record<HomeLabApplication, HomeLabMachine>
> = Object.fromEntries(
  Object.values(ALL_STACKS).flatMap((stack) =>
    stack.applications.map((app): [HomeLabApplication, HomeLabMachine] => [
      app,
      stack.machine
    ])
  )
);

/**
 * All applications that belong to at least one stack.
 * Standalone apps (e.g. Docker) are not included.
 */
export const ALL_APPLICATIONS: HomeLabApplication[] = Object.values(
  ALL_STACKS
).flatMap<HomeLabApplication>((stack) => stack.applications);

/**
 * Returns every application configured to run on the given machine.
 *
 * @param machine the machine to look up
 */
export function getExpectedApps(machine: HomeLabMachine): HomeLabApplication[] {
  return ALL_APPLICATIONS.filter(
    (app) => APPLICATION_MACHINE_MAP[app] === machine
  );
}

/**
 * Returns the unique set of machines that have at least one stack application
 * assigned to them.
 */
export function getMachinesWithApps(): HomeLabMachine[] {
  return [
    ...new Set(
      ALL_APPLICATIONS.map((app) => APPLICATION_MACHINE_MAP[app]).filter(
        (m): m is HomeLabMachine => m !== undefined
      )
    )
  ];
}
