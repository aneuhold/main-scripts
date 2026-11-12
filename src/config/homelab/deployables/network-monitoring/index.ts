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
import {
  getMonitoringRouterPassword,
  MONITORING_ROUTER_USER,
  routerMonitoringLogin
} from './routerMonitoringLogin.js';

/**
 * Directory holding this deployable's co-located assets (yaml config, the
 * Grafana dashboard, and the traffic collector script). `pnpm build` copies them from the
 * `src/config/homelab` tree, so this runtime path resolves
 * against the compiled module's own directory.
 */
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

const REMOTE_DIR = '~/monitoring';

/**
 * Builds a remote file from a co-located asset, written under {@link REMOTE_DIR}
 * at the same relative path unless `remotePath` is given.
 *
 * @param localPath path of the asset relative to this deployable's folder
 * @param remotePath path to write it to, relative to {@link REMOTE_DIR}
 */
const asset = (localPath: string, remotePath = localPath): RemoteFile => [
  `${REMOTE_DIR}/${remotePath}`,
  readFileSync(join(CONFIG_DIR, localPath), 'utf8')
];

/**
 * Machine that hosts the monitoring stack.
 */
const MONITORING_HOST = HomeLabMachine.Pi1;

/**
 * InfluxDB organization and bucket the traffic data lands in. Not secrets, so
 * they live here rather than in the user config. Shared by InfluxDB (init), the
 * traffic collector (writes), and Grafana (reads) via the stack's .env.
 */
const INFLUX_ORG = 'homelab';
const INFLUX_BUCKET = 'traffic';

/**
 * The network-monitoring compose stack: the traffic collector streams the
 * router's Traffic Analysis counters into InfluxDB, which Grafana queries.
 */
export const networkMonitoring = createDockerComposeStack({
  name: 'network-monitoring',
  label: 'network monitoring',
  machine: MONITORING_HOST,
  remoteDir: REMOTE_DIR,
  services: ['influxdb', 'traffic-collector', 'grafana'],
  dependsOn: [routerMonitoringLogin.name],
  files: [
    asset('docker-compose.yaml'),
    // Shipped as .mts so Node runs it as ESM without a package.json.
    asset(
      'traffic-collector/trafficCollector.remote.ts',
      'traffic-collector/trafficCollector.mts'
    ),
    asset('grafana/provisioning/datasources/datasources.yaml'),
    asset('grafana/provisioning/dashboards/dashboards.yaml'),
    asset('grafana/provisioning/dashboards/home-network-traffic.json')
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
        `INFLUX_BUCKET=${INFLUX_BUCKET}`,
        `ROUTER_HOST=${MACHINES[HomeLabMachine.Router].host}`,
        `ROUTER_USER=${MONITORING_ROUTER_USER}`,
        `ROUTER_PASSWORD=${getMonitoringRouterPassword(config)}`
      ].join('\n') + '\n';

    return [[`${REMOTE_DIR}/.env`, envContent]];
  }
});
