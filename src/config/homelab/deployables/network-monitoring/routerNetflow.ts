import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../../services/HomeLab/HomeLabNetworkService.js';
import { createRouterConfig } from '../../drivers/createRouterConfig.js';
import { HomeLabMachine } from '../../types.js';

/**
 * Builds the EdgeRouter config that exports NetFlow (v9) and syslog to the
 * Pi-hole host and hands out that host's IP as the DHCP DNS server. The host's
 * LAN IP is discovered over SSH at deploy time.
 *
 * @param piholeMachine the machine that hosts Pi-hole, whose IP the router exports to
 */
export const createRouterNetflow = (piholeMachine: HomeLabMachine) =>
  createRouterConfig({
    name: 'router-netflow',
    label: 'router NetFlow / syslog',
    machine: HomeLabMachine.Router,
    buildCommands: async () => {
      DR.logger.info(`Discovering IP of ${piholeMachine} (hosts Pi-hole)...`);

      const ipResult = await HomeLabNetworkService.sshCapture(
        piholeMachine,
        "hostname -I | awk '{print $1}'"
      );
      if (ipResult.exitCode !== 0 || !ipResult.output) {
        DR.logger.error(
          `Could not determine IP of ${piholeMachine}. Is it reachable?`
        );
        process.exit(1);
      }

      const piIp = ipResult.output;
      DR.logger.info(`${piholeMachine} LAN IP: ${piIp}`);

      // EdgeOS (Vyatta-based) CLI references for the command groups below:
      // - flow-accounting / NetFlow: https://docs.vyos.io/en/latest/configuration/system/flow-accounting.html
      //   and https://www.site24x7.com/help/netflow/configuring-flow-exports/ubiquiti-edgemax.html
      // - syslog host: https://help.ui.com/hc/en-us/articles/204975904-EdgeRouter-Define-remote-syslog-server-for-system-logs
      // - DHCP dns-server: https://help.uisp.com/hc/en-us/articles/22591175599639-EdgeRouter-DHCP-Server
      return [
        'configure',
        // NetFlow v9 export of eth0 traffic to the Pi-hole host on UDP port 2055.
        'set system flow-accounting interface eth0',
        'set system flow-accounting netflow version 9',
        `set system flow-accounting netflow server ${piIp} port 2055`,
        'set system flow-accounting netflow timeout expiry-interval 60',
        'set system flow-accounting netflow timeout flow-generic 60',
        'set system flow-accounting netflow timeout max-active-life 600',
        // Forward all syslog facilities at info and above to the Pi-hole host.
        `set system syslog host ${piIp} facility all level info`,
        // Hand out the Pi-hole host as the DHCP DNS server. dns-server is a
        // per-subnet option, so each shared-network needs its subnet CIDR.
        // Update the network names and subnet CIDRs to match your router's DHCP config.
        `set service dhcp-server shared-network-name LAN subnet <lan-subnet-cidr> dns-server ${piIp}`,
        `set service dhcp-server shared-network-name IoT subnet <iot-subnet-cidr> dns-server ${piIp}`,
        'commit',
        'save',
        'exit'
      ];
    }
  });
