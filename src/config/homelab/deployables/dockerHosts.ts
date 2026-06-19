import { createDockerHostSetup } from '../drivers/createDockerHostSetup.js';
import { HomeLabMachine } from '../types.js';

/**
 * Makes Pi1 a Docker host. Compose stacks on Pi1 depend on this automatically
 * (see {@link createDockerComposeStack}).
 */
export const pi1DockerHost = createDockerHostSetup({
  machine: HomeLabMachine.Pi1
});

/**
 * Makes Pi2 a Docker host. Compose stacks on Pi2 depend on this automatically
 * (see {@link createDockerComposeStack}).
 */
export const pi2DockerHost = createDockerHostSetup({
  machine: HomeLabMachine.Pi2
});
