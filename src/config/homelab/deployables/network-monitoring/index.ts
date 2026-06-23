import { DR } from '@aneuhold/core-ts-lib';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MainScriptsConfig } from '../../../../services/Config.service.js';
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
 * Machine that hosts the monitoring stack (the NetFlow/syslog collectors).
 * Shared by the compose stack and the router NetFlow export so both target the
 * same host.
 */
const MONITORING_HOST = HomeLabMachine.Pi1;

/**
 * Router NetFlow/syslog export feeding this monitoring stack. Built here so it
 * inherits the stack's host machine, and depended on by the stack so the export
 * is in place before deploy.
 */
export const routerNetflow = createRouterNetflow(MONITORING_HOST);

/**
 * InfluxDB organization and bucket the flow data lands in. Not secrets, so they
 * live here rather than in the user config. Shared by InfluxDB (init), Telegraf
 * (writes), and Grafana (reads) via the stack's .env.
 */
const INFLUX_ORG = 'homelab';
const INFLUX_BUCKET = 'netflow';

/**
 * The network-monitoring compose stack: Telegraf collects the router's NetFlow
 * v9 export into InfluxDB, which Grafana queries. The docker-host install is
 * depended on automatically by the compose driver; this adds the router NetFlow
 * export so flow data is flowing before deploy.
 */
export const networkMonitoring = createDockerComposeStack({
  name: 'network-monitoring',
  label: 'network monitoring',
  machine: MONITORING_HOST,
  remoteDir: REMOTE_DIR,
  services: ['influxdb', 'telegraf', 'grafana'],
  dependsOn: [routerNetflow.name],
  files: [
    [
      `${REMOTE_DIR}/docker-compose.yaml`,
      readFileSync(join(CONFIG_DIR, 'docker-compose.yaml'), 'utf8')
    ],
    [
      `${REMOTE_DIR}/telegraf/telegraf.conf`,
      readFileSync(join(CONFIG_DIR, 'telegraf', 'telegraf.conf'), 'utf8')
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
    const grafanaPassword = config.homelab?.grafana?.adminPassword;
    const influxPassword = config.homelab?.influxdb?.adminPassword;
    const influxToken = config.homelab?.influxdb?.adminToken;

    if (!grafanaPassword) {
      DR.logger.info(
        'homelab.grafana.adminPassword not set in ~/.config/tb-main-scripts.json. ' +
          'Deploying with "changeme" as placeholder'
      );
    }
    if (!influxPassword || !influxToken) {
      DR.logger.info(
        'homelab.influxdb.adminPassword / adminToken not set in ~/.config/tb-main-scripts.json. ' +
          'Deploying with "changeme" placeholders'
      );
    }

    const envContent =
      [
        'TZ=America/Los_Angeles',
        `GRAFANA_ADMIN_PASSWORD=${grafanaPassword ?? 'changeme'}`,
        `INFLUXDB_ADMIN_PASSWORD=${influxPassword ?? 'changeme'}`,
        `INFLUX_TOKEN=${influxToken ?? 'changeme'}`,
        `INFLUX_ORG=${INFLUX_ORG}`,
        `INFLUX_BUCKET=${INFLUX_BUCKET}`
      ].join('\n') + '\n';

    return [[`${REMOTE_DIR}/.env`, envContent]];
  }
});
