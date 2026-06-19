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
import { createRouterNetflow } from './routerNetflow.js';

/**
 * Directory holding this deployable's co-located yaml assets. `pnpm build`
 * copies the whole `src/config/homelab` tree, so this runtime path resolves
 * against the compiled module's own directory.
 */
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

const REMOTE_DIR = '~/monitoring';

/**
 * Machine that hosts the monitoring stack, including Pi-hole. Shared by the
 * compose stack and the router config so both target the same host.
 */
const MONITORING_HOST = HomeLabMachine.Pi1;

/**
 * Router NetFlow/syslog/DNS export feeding this monitoring stack. Built here so
 * it inherits the stack's host machine, and depended on by the stack so the
 * export is in place before deploy.
 */
export const routerNetflow = createRouterNetflow(MONITORING_HOST);

/**
 * The network-monitoring compose stack (Pi-hole, ntopng, Loki, Promtail,
 * Grafana). The docker-host install is depended on automatically by the compose
 * driver; this adds the router NetFlow/syslog export so flow/log data is flowing
 * before deploy.
 */
export const networkMonitoring = createDockerComposeStack({
  name: 'network-monitoring',
  label: 'network monitoring',
  machine: MONITORING_HOST,
  remoteDir: REMOTE_DIR,
  services: ['pihole', 'ntopng', 'loki', 'promtail', 'grafana'],
  dependsOn: [routerNetflow.name],
  files: [
    [
      `${REMOTE_DIR}/docker-compose.yaml`,
      readFileSync(join(CONFIG_DIR, 'docker-compose.yaml'), 'utf8')
    ],
    [
      `${REMOTE_DIR}/loki/loki-config.yaml`,
      readFileSync(join(CONFIG_DIR, 'loki', 'loki-config.yaml'), 'utf8')
    ],
    [
      `${REMOTE_DIR}/promtail/promtail-config.yaml`,
      readFileSync(join(CONFIG_DIR, 'promtail', 'promtail-config.yaml'), 'utf8')
    ],
    [
      `${REMOTE_DIR}/grafana/provisioning/datasources/datasources.yaml`,
      readFileSync(
        join(
          CONFIG_DIR,
          'grafana',
          'provisioning',
          'datasources',
          'datasources.yaml'
        ),
        'utf8'
      )
    ]
  ],
  env: (config: MainScriptsConfig): RemoteFile[] => {
    const piholePassword = config.homelab?.pihole?.webPassword;
    const grafanaPassword = config.homelab?.grafana?.adminPassword;

    if (!piholePassword || !grafanaPassword) {
      DR.logger.info(
        'homelab.pihole.webPassword or homelab.grafana.adminPassword not set in ' +
          '~/.config/tb-main-scripts.json — deploying with "changeme" as placeholder'
      );
    }

    const envContent =
      [
        'TZ=America/Los_Angeles',
        `PIHOLE_WEBPASSWORD=${piholePassword ?? 'changeme'}`,
        `GRAFANA_ADMIN_PASSWORD=${grafanaPassword ?? 'changeme'}`
      ].join('\n') + '\n';

    return [[`${REMOTE_DIR}/.env`, envContent]];
  }
});
