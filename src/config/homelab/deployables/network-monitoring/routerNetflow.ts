import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../../services/HomeLab/HomeLabNetwork.service.js';
import { createRouterConfig } from '../../drivers/createRouterConfig.js';
import { HomeLabMachine } from '../../types.js';

/**
 * Builds the EdgeRouter config that exports NetFlow (v9) and syslog to the
 * monitoring host (the collectors). The host's LAN IP is discovered over SSH at
 * deploy time.
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
 * @param monitoringMachine the machine that hosts the NetFlow/syslog collectors
 */
export const createRouterNetflow = (monitoringMachine: HomeLabMachine) =>
  createRouterConfig({
    name: 'router-netflow',
    label: 'router NetFlow / syslog',
    machine: HomeLabMachine.Router,
    buildCommands: async () => {
      DR.logger.info(
        `Discovering IP of ${monitoringMachine} (hosts the collectors)...`
      );

      const ipResult = await HomeLabNetworkService.sshCapture(
        monitoringMachine,
        "hostname -I | awk '{print $1}'"
      );
      if (ipResult.exitCode !== 0 || !ipResult.output) {
        DR.logger.error(
          `Could not determine IP of ${monitoringMachine}. Is it reachable?`
        );
        process.exit(1);
      }

      const collectorIp = ipResult.output;
      DR.logger.info(`${monitoringMachine} LAN IP: ${collectorIp}`);

      // EdgeOS (Vyatta-based) CLI references for the command groups below:
      // - flow-accounting / NetFlow: https://docs.vyos.io/en/latest/configuration/system/flow-accounting.html
      //   and https://www.site24x7.com/help/netflow/configuring-flow-exports/ubiquiti-edgemax.html
      // - syslog host: https://help.ui.com/hc/en-us/articles/204975904-EdgeRouter-Define-remote-syslog-server-for-system-logs
      return [
        'configure',
        // NetFlow v9 export of LAN traffic (switch0) to the monitoring host on
        // UDP port 2055.
        'set system flow-accounting interface switch0',
        // https://docs.vyos.io/en/rolling/configuration/system/flow-accounting.html#netflow
        'set system flow-accounting netflow version 9',
        // 2055 is the standard netflow port
        `set system flow-accounting netflow server ${collectorIp} port 2055`,
        // At least every 60 seconds, report completed flows
        'set system flow-accounting netflow timeout expiry-interval 60',
        // After 60 seconds of inactivity for a flow, it is considered complete
        'set system flow-accounting netflow timeout flow-generic 60',
        // How long a flow can process before being flushed. A 3 hour download will still report
        // once very 600 seconds.
        'set system flow-accounting netflow timeout max-active-life 600',
        // Forward all syslog facilities at info and above to the monitoring host.
        `set system syslog host ${collectorIp} facility all level info`,
        'commit',
        'save',
        'exit'
      ];
    }
  });
