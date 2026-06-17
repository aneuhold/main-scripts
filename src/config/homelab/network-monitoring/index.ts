import { DR } from '@aneuhold/core-ts-lib';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MainScriptsConfig } from '../../../services/ConfigService.js';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import { HomeLabApplication, HomeLabMachine, HomeLabStack } from '../types.js';

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

export const networkMonitoring: HomeLabStack = {
  name: 'network monitoring',
  machine: HomeLabMachine.Pi1,
  remoteDir: '~/monitoring',
  applications: [
    HomeLabApplication.Pihole,
    HomeLabApplication.Ntopng,
    HomeLabApplication.Loki,
    HomeLabApplication.Promtail,
    HomeLabApplication.Grafana
  ],
  peerDependencies: [],
  ops: {
    deploy: (config: MainScriptsConfig) => {
      const machine = HomeLabMachine.Pi1;
      const remoteDir = '~/monitoring';

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

      const files: Array<[string, string]> = [
        [
          `${remoteDir}/docker-compose.yaml`,
          readFileSync(join(CONFIG_DIR, 'docker-compose.yaml'), 'utf8')
        ],
        [
          `${remoteDir}/loki/loki-config.yaml`,
          readFileSync(join(CONFIG_DIR, 'loki', 'loki-config.yaml'), 'utf8')
        ],
        [
          `${remoteDir}/promtail/promtail-config.yaml`,
          readFileSync(
            join(CONFIG_DIR, 'promtail', 'promtail-config.yaml'),
            'utf8'
          )
        ],
        [
          `${remoteDir}/grafana/provisioning/datasources/datasources.yaml`,
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
        ],
        [`${remoteDir}/.env`, envContent]
      ];

      DR.logger.info(
        `Writing network monitoring config files to ${machine}...`
      );
      for (const [path, content] of files) {
        DR.logger.info(`  Writing ${path}`);
        if (!HomeLabNetworkService.writeRemoteFile(machine, path, content)) {
          process.exit(1);
        }
      }

      DR.logger.info('Starting network monitoring stack...');
      const upCode = HomeLabNetworkService.sshRun(
        machine,
        `cd ${remoteDir} && docker compose up -d`
      );
      if (upCode !== 0) {
        DR.logger.error(`docker compose up failed (exit ${upCode})`);
        process.exit(upCode);
      }

      DR.logger.info('Network monitoring stack is up!');
      DR.logger.info('  Pi-hole  → http://pi3-bplus-1.local:8080/admin');
      DR.logger.info('  ntopng   → http://pi3-bplus-1.local:3000');
      DR.logger.info('  Grafana  → http://pi3-bplus-1.local:3001');
    }
  }
};
