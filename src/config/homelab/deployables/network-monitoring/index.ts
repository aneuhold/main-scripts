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
import {
  getPiholeWebPassword,
  pihole,
  PIHOLE_API_URL
} from '../pihole/index.js';

/**
 * Directory holding this deployable's co-located assets (yaml config, the
 * Grafana dashboard, and the bundled Pi-hole collector). `pnpm build` copies
 * the yaml and json from the `src/config/homelab` tree and bundles the
 * collector alongside, so this runtime path resolves against the compiled
 * module's own directory.
 */
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

const REMOTE_DIR = '~/monitoring';

/** Folder of the Pi-hole collector, locally and under {@link REMOTE_DIR}. */
const COLLECTOR_DIR = 'pihole-collector';

/**
 * Builds a remote file from a co-located asset, written under {@link REMOTE_DIR}
 * at the same relative path.
 *
 * @param path path of the asset relative to this deployable's folder
 */
const asset = (path: string): RemoteFile => [
  `${REMOTE_DIR}/${path}`,
  readFileSync(join(CONFIG_DIR, path), 'utf8')
];

/**
 * Machine that hosts the monitoring stack.
 */
const MONITORING_HOST = HomeLabMachine.Pi1;

/**
 * InfluxDB organization and bucket the DNS activity data lands in. Not secrets,
 * so they live here rather than in the user config. Shared by InfluxDB (init),
 * the Pi-hole collector (writes), and Grafana (reads) via the stack's .env.
 */
const INFLUX_ORG = 'homelab';
const INFLUX_BUCKET = 'dns';

/**
 * How long InfluxDB keeps the bucket's data. Longer than Pi-hole's own 91 days
 * of query history, since per-minute counts are small.
 */
const INFLUX_RETENTION = '365d';

/**
 * The network-monitoring compose stack: the Pi-hole collector copies Pi-hole's
 * query log into InfluxDB as per-minute lookup counts per device and site,
 * which Grafana queries.
 */
export const networkMonitoring = createDockerComposeStack({
  name: 'network-monitoring',
  label: 'network monitoring',
  machine: MONITORING_HOST,
  remoteDir: REMOTE_DIR,
  services: ['influxdb', 'pihole-collector', 'grafana'],
  dependsOn: [pihole.name],
  files: (config: MainScriptsConfig): RemoteFile[] => {
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
        `INFLUX_RETENTION=${INFLUX_RETENTION}`,
        `PIHOLE_URL=${PIHOLE_API_URL}`,
        `PIHOLE_PASSWORD=${getPiholeWebPassword(config)}`
      ].join('\n') + '\n';
    const deviceNames = config.homelab?.networkMonitoring?.deviceNames ?? {};

    return [
      asset('docker-compose.yaml'),
      asset(`${COLLECTOR_DIR}/piholeCollector.remote.mjs`),
      asset('grafana/provisioning/datasources/datasources.yaml'),
      asset('grafana/provisioning/dashboards/dashboards.yaml'),
      asset('grafana/provisioning/dashboards/home-network-activity.json'),
      [`${REMOTE_DIR}/.env`, envContent],
      [
        `${REMOTE_DIR}/${COLLECTOR_DIR}/device-names.json`,
        `${JSON.stringify(deviceNames, null, 2)}\n`
      ]
    ];
  }
});
