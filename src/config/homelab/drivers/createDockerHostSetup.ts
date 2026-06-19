import { MACHINES } from '../machines.js';
import { Deployable, HomeLabMachine } from '../types.js';
import { createHostSetup } from './createHostSetup.js';

/**
 * The registry name of the Docker host setup for a machine. A pure function so
 * the compose driver can derive its `dependsOn` from a machine without importing
 * the host-setup instance — keeping the dependency machine-correct (a Pi2 stack
 * depends on the Pi2 host setup) and the coupling driver-to-driver.
 *
 * @param machine the machine the setup targets
 */
export const dockerHostSetupName = (machine: HomeLabMachine): string =>
  `docker-host-setup:${machine}`;

/**
 * Builds the Docker host setup for a machine: installs Docker (idempotent —
 * re-running `get.docker.com` is safe) and adds the machine's SSH login user to
 * the `docker` group, then verifies the daemon is up. A thin docker-specific
 * preset over {@link createHostSetup}, so multiple docker hosts are one line
 * each instead of duplicating the install commands.
 *
 * @param params the host parameters
 * @param params.machine the machine to make a Docker host
 */
export function createDockerHostSetup({
  machine
}: {
  machine: HomeLabMachine;
}): Deployable {
  const user = MACHINES[machine].user;
  return createHostSetup({
    name: dockerHostSetupName(machine),
    label: `Docker host setup (${machine})`,
    machine,
    commands: [
      'curl -fsSL https://get.docker.com | sudo sh',
      // The below makes it so that any subsequent docker commands don't require sudo.
      `sudo usermod -aG docker ${user}`
    ],
    verify: (ctx, m) => !!ctx.machines[m].docker
  });
}
