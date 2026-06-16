/**
 * Identifies a physical machine in the home lab. Use stable hardware
 * identifiers here — not roles like "primary" or "spare", which can change.
 */
export enum HomeLabMachine {
  Pi1 = 'pi3-bplus-1',
  Pi2 = 'pi3-b-1',
  Router = 'edgerouter-x'
}

/**
 * SSH connection strings for each machine.
 */
export const MACHINE_SSH: Record<HomeLabMachine, string> = {
  [HomeLabMachine.Pi1]: 'neuholda@pi3-bplus-1.local',
  [HomeLabMachine.Pi2]: 'neuholda@pi3-b-1.local',
  [HomeLabMachine.Router]: 'admin@ubnt.local'
};

/**
 * A service running in the home lab. Each value matches the Docker
 * container_name in docker-compose.yaml so the audit can compare directly.
 */
export enum HomeLabApplication {
  Pihole = 'pihole',
  Ntopng = 'ntopng',
  Loki = 'loki',
  Promtail = 'promtail',
  Grafana = 'grafana'
}

/**
 * Kept in sync with {@link HomeLabApplication} — add a new entry here whenever
 * the enum gains a value. Provides iteration without losing enum typing.
 */
const ALL_APPLICATIONS: HomeLabApplication[] = [
  HomeLabApplication.Pihole,
  HomeLabApplication.Ntopng,
  HomeLabApplication.Loki,
  HomeLabApplication.Promtail,
  HomeLabApplication.Grafana
];

/**
 * Declares which machine is responsible for hosting each application.
 * Change a value here to move a service to a different machine — deploy and
 * audit derive their targets from this map at runtime.
 */
export const APPLICATION_MACHINE_MAP: Record<
  HomeLabApplication,
  HomeLabMachine
> = {
  [HomeLabApplication.Pihole]: HomeLabMachine.Pi1,
  [HomeLabApplication.Ntopng]: HomeLabMachine.Pi1,
  [HomeLabApplication.Loki]: HomeLabMachine.Pi1,
  [HomeLabApplication.Promtail]: HomeLabMachine.Pi1,
  [HomeLabApplication.Grafana]: HomeLabMachine.Pi1
};

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
 * Returns the unique set of machines that have at least one application
 * assigned to them.
 */
export function getMachinesWithApps(): HomeLabMachine[] {
  return [
    ...new Set(ALL_APPLICATIONS.map((app) => APPLICATION_MACHINE_MAP[app]))
  ];
}
