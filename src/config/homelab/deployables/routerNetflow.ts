import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import { createRouterConfig } from '../drivers/createRouterConfig.js';
import { HomeLabMachine } from '../types.js';

/**
 * Configures the EdgeRouter to export NetFlow (v9) and syslog to the Pi-hole
 * machine and to hand out its IP as the DHCP DNS server, so network monitoring
 * receives flow and log data. Discovers the Pi-hole LAN IP at deploy time.
 */
export const routerNetflow = createRouterConfig({
  name: 'router-netflow',
  label: 'router NetFlow / syslog',
  machine: HomeLabMachine.Router,
  buildCommands: () => {
    const piholeMachine = HomeLabMachine.Pi1;
    DR.logger.info(`Discovering IP of ${piholeMachine}...`);

    const ipResult = HomeLabNetworkService.sshCapture(
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

    return [
      'configure',
      'set system flow-accounting interface eth0',
      'set system flow-accounting netflow version 9',
      `set system flow-accounting netflow server ${piIp} port 2055`,
      'set system flow-accounting netflow timeout expiry-interval 60',
      'set system flow-accounting netflow timeout flow-generic 60',
      'set system flow-accounting netflow timeout max-active-life 600',
      `set system syslog host ${piIp} facility all level info`,
      // Update shared-network-name values to match your router's DHCP config
      `set service dhcp-server shared-network-name LAN dns-server ${piIp}`,
      `set service dhcp-server shared-network-name IoT dns-server ${piIp}`,
      'commit',
      'save',
      'exit'
    ];
  }
});
