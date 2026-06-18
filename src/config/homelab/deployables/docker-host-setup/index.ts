import { createHostSetup } from '../../drivers/createHostSetup.js';
import { HomeLabMachine } from '../../types.js';

/**
 * Installs Docker on the primary Pi and adds the login user to the `docker`
 * group. Idempotent — re-running `get.docker.com` is safe. Network monitoring
 * depends on this so the daemon is present before the stack deploys.
 */
export const dockerHostSetup = createHostSetup({
  name: 'docker-host-setup',
  label: 'Docker host setup',
  machine: HomeLabMachine.Pi1,
  commands: [
    'curl -fsSL https://get.docker.com | sudo sh',
    'sudo usermod -aG docker neuholda'
  ]
});
