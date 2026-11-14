import { DR } from '@aneuhold/core-ts-lib';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MainScriptsConfig } from '../../../../services/Config.service.js';
import {
  createDockerComposeStack,
  RemoteFile
} from '../../drivers/createDockerComposeStack.js';
import { MACHINES } from '../../machines.js';
import { HomeLabMachine } from '../../types.js';
import { createRouterDns, LAN_SUBNET } from './routerDns.js';

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
 * Port Pi-hole's web UI and API listen on. Pi-hole uses host networking, so
 * this binds the host directly.
 */
const PIHOLE_WEB_PORT = 8080;

/**
 * Base URL of Pi-hole's API for clients that resolve DNS through Pi-hole.
 * Pi-hole answers `pi.hole` with its own host's address, so the URL follows
 * Pi-hole to whichever machine runs it.
 */
export const PIHOLE_API_URL = `http://pi.hole:${PIHOLE_WEB_PORT}`;
/**
 * Currently this is the host. It is hard-configured to be a specific IP, so shouldn't be an issue
 * at the moment.
 */
const ROUTER_LAN_IP = MACHINES[HomeLabMachine.Router].host;

/**
 * Local domain label applied to conditionally-forwarded client names. Link to docs:
 * https://docs.pi-hole.net/ftldns/configfile/?h=revser#revservers
 */
const LAN_DOMAIN = 'lan';

/**
 * Pi-hole conditional-forwarding entry. Forwards reverse lookups for the LAN
 * subnet to the router so the dashboard and query log show device names instead
 * of bare IPs. Format is `<enabled>,<cidr>,<target>,<domain>`.
 *
 * Link to docs: https://docs.pi-hole.net/ftldns/configfile/?h=revser#revservers
 */
const PIHOLE_REVSERVERS = `true,${LAN_SUBNET},${ROUTER_LAN_IP},${LAN_DOMAIN}`;

/**
 * Returns Pi-hole's web password from the user config, or a "changeme"
 * placeholder (with a notice) when it is unset. The same password logs in to
 * the web UI and the API.
 *
 * @param config the loaded user config
 */
export const getPiholeWebPassword = (config: MainScriptsConfig): string => {
  const password = config.homelab?.pihole?.webPassword;
  if (!password) {
    DR.logger.info(
      'homelab.pihole.webPassword not set in ~/.config/tb-main-scripts.json. ' +
        'Deploying with "changeme" as placeholder'
    );
  }
  return password ?? 'changeme';
};

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
  files: (config: MainScriptsConfig): RemoteFile[] => {
    const envContent =
      [
        'TZ=America/Los_Angeles',
        `PIHOLE_WEBPASSWORD=${getPiholeWebPassword(config)}`,
        `PIHOLE_WEB_PORT=${PIHOLE_WEB_PORT}`,
        `PIHOLE_REVSERVERS=${PIHOLE_REVSERVERS}`
      ].join('\n') + '\n';

    return [
      [
        `${REMOTE_DIR}/docker-compose.yaml`,
        readFileSync(join(CONFIG_DIR, 'docker-compose.yaml'), 'utf8')
      ],
      [`${REMOTE_DIR}/.env`, envContent]
    ];
  }
});

/**
 * Router config that hands out the Pi-hole host as the LAN's DHCP DNS server.
 * Depends on the Pi-hole stack so clients are only repointed once Pi-hole is
 * actually serving DNS on that host.
 */
export const routerDns = createRouterDns(PIHOLE_HOST, [pihole.name]);
