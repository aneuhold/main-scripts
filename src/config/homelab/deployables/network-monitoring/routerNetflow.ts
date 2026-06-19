import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../../services/HomeLab/HomeLabNetworkService.js';
import { createRouterConfig } from '../../drivers/createRouterConfig.js';
import { HomeLabMachine } from '../../types.js';

/** The single LAN subnet served by the router's DHCP shared-network. */
const LAN_SUBNET: string = '192.168.0.0/24';

/**
 * Builds the EdgeRouter config that exports NetFlow (v9) and syslog to the
 * Pi-hole host and hands out that host's IP as the sole DHCP DNS server. The
 * host's LAN IP is discovered over SSH at deploy time.
 *
 * NetFlow is captured on `switch0`, the LAN bridge, so flows carry pre-NAT
 * per-device source IPs. `eth0` is the WAN uplink; capturing it would only
 * surface post-NAT totals under the router's public IP.
 *
 * The router has hardware offload (`system offload hwnat`) enabled. Offloaded
 * flows bypass the path flow-accounting samples, so NetFlow undercounts
 * forwarded traffic until offload is disabled, which is a throughput tradeoff
 * left to a deliberate change.
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
        // NetFlow v9 export of LAN traffic (switch0) to the Pi-hole host on
        // UDP port 2055.
        'set system flow-accounting interface switch0',
        'set system flow-accounting netflow version 9',
        `set system flow-accounting netflow server ${piIp} port 2055`,
        'set system flow-accounting netflow timeout expiry-interval 60',
        'set system flow-accounting netflow timeout flow-generic 60',
        'set system flow-accounting netflow timeout max-active-life 600',
        // Forward all syslog facilities at info and above to the Pi-hole host.
        `set system syslog host ${piIp} facility all level info`,
        // Hand out the Pi-hole host as the only DHCP DNS server. dns-server is a
        // multi-value node, so the whole node is deleted first to replace it
        // rather than append a second resolver. delete + set run in the same
        // configure/commit transaction, so they apply atomically: clients keep
        // the old resolver until commit, never zero resolvers. IoT isolation
        // lives on the access points, so the router's single LAN network is the
        // only one to update.
        `delete service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server`,
        `set service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server ${piIp}`,
        'commit',
        'save',
        'exit'
      ];
    }
  });
