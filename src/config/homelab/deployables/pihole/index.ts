import { DR } from '@aneuhold/core-ts-lib';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MainScriptsConfig } from '../../../../services/ConfigService.js';
import {
  createDockerComposeStack,
  RemoteFile
} from '../../drivers/createDockerComposeStack.js';
import { HomeLabMachine } from '../../types.js';
import { createRouterDns } from './routerDns.js';

/**
 * Directory holding this deployable's co-located yaml assets. `pnpm build`
 * copies the whole `src/config/homelab` tree, so this runtime path resolves
 * against the compiled module's own directory.
 */
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

const REMOTE_DIR = '~/pihole';

/**
 * Machine that hosts Pi-hole. Shared by the compose stack and the router DNS
 * config so the DHCP server hands out the host Pi-hole actually runs on.
 */
const PIHOLE_HOST = HomeLabMachine.Pi1;

/**
 * The Pi-hole DNS / ad-blocking compose stack. Kept separate from the
 * observability stack: it shares no containers, volumes, or networks with the
 * monitoring services, DNS is load-bearing for the LAN, and it can fail over to
 * a different host on its own.
 */
export const pihole = createDockerComposeStack({
  name: 'pihole',
  label: 'Pi-hole',
  machine: PIHOLE_HOST,
  remoteDir: REMOTE_DIR,
  services: ['pihole'],
  files: [
    [
      `${REMOTE_DIR}/docker-compose.yaml`,
      readFileSync(join(CONFIG_DIR, 'docker-compose.yaml'), 'utf8')
    ]
  ],
  env: (config: MainScriptsConfig): RemoteFile[] => {
    const piholePassword = config.homelab?.pihole?.webPassword;

    if (!piholePassword) {
      DR.logger.info(
        'homelab.pihole.webPassword not set in ~/.config/tb-main-scripts.json — ' +
          'deploying with "changeme" as placeholder'
      );
    }

    const envContent =
      [
        'TZ=America/Los_Angeles',
        `PIHOLE_WEBPASSWORD=${piholePassword ?? 'changeme'}`
      ].join('\n') + '\n';

    return [[`${REMOTE_DIR}/.env`, envContent]];
  }
});

/**
 * Router config that hands out the Pi-hole host as the LAN's DHCP DNS server.
 * Depends on the Pi-hole stack so clients are only repointed once Pi-hole is
 * actually serving DNS on that host.
 */
export const routerDns = createRouterDns(PIHOLE_HOST, [pihole.name]);
