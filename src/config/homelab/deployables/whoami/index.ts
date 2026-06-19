import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createDockerComposeStack } from '../../drivers/createDockerComposeStack.js';
import { HomeLabMachine } from '../../types.js';

/**
 * Directory holding this deployable's co-located yaml assets. `pnpm build`
 * copies the whole `src/config/homelab` tree, so this runtime path resolves
 * against the compiled module's own directory.
 */
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

const REMOTE_DIR = '~/whoami';

/**
 * Machine the test container is deployed to. Change this constant to point the
 * test at a different host.
 */
const WHOAMI_HOST = HomeLabMachine.Pi2;

/**
 * A throwaway single-container stack that confirms a host can pull and run a
 * Docker container. `traefik/whoami` is a tiny image that stays running and
 * serves an HTTP page on the mapped port, so a successful deploy shows up as
 * Running in audit and can be reached at `http://<host>:8088`. The docker-host
 * install is depended on automatically by the compose driver, so deploying to a
 * fresh host also exercises that setup.
 */
export const whoami = createDockerComposeStack({
  name: 'whoami',
  machine: WHOAMI_HOST,
  remoteDir: REMOTE_DIR,
  services: ['whoami'],
  files: [
    [
      `${REMOTE_DIR}/docker-compose.yaml`,
      readFileSync(join(CONFIG_DIR, 'docker-compose.yaml'), 'utf8')
    ]
  ]
});
