import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../../services/HomeLab/HomeLabNetwork.service.js';
import { createRouterConfig } from '../../drivers/createRouterConfig.js';
import { HomeLabMachine } from '../../types.js';

/** The single LAN subnet served by the router's DHCP shared-network. */
const LAN_SUBNET: string = '192.168.0.0/24';

/**
 * Resolves the first LAN IP of the given machine over SSH. Returns null when the
 * machine is unreachable or reports no address.
 *
 * @param machine the machine whose primary LAN IP to discover
 */
const discoverLanIp = async (
  machine: HomeLabMachine
): Promise<string | null> => {
  const ipResult = await HomeLabNetworkService.sshCapture(
    machine,
    "hostname -I | awk '{print $1}'"
  );
  if (ipResult.exitCode !== 0 || !ipResult.output) {
    return null;
  }
  return ipResult.output;
};

/**
 * Builds the EdgeRouter config that hands out the Pi-hole host as the sole DHCP
 * DNS server for the LAN. The host's LAN IP is discovered over SSH at deploy
 * time.
 *
 * @param piholeMachine the machine that hosts Pi-hole, whose IP the DHCP server hands out
 * @param dependsOn names of deployables that must be satisfied before this one deploys
 */
export const createRouterDns = (
  piholeMachine: HomeLabMachine,
  dependsOn: string[]
) =>
  createRouterConfig({
    name: 'router-dns',
    label: 'router DHCP DNS',
    machine: HomeLabMachine.Router,
    dependsOn,
    verify: async () => {
      const piIp = await discoverLanIp(piholeMachine);
      if (!piIp) {
        return false;
      }

      // Read back the live DHCP dns-server for the LAN subnet. cli-shell-api is
      // EdgeOS's scripting interface and returns the active config values
      // space-separated and single-quoted (e.g. `'192.168.0.50'`). The config is
      // in place only when the configured resolver is the current Pi-hole IP, so
      // a Pi-hole IP change correctly surfaces as drift.
      const dnsResult = await HomeLabNetworkService.sshCapture(
        HomeLabMachine.Router,
        `cli-shell-api returnActiveValues service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server`
      );
      if (dnsResult.exitCode !== 0) {
        return false;
      }
      return dnsResult.output.includes(piIp);
    },
    buildCommands: async () => {
      DR.logger.info(`Discovering IP of ${piholeMachine} (hosts Pi-hole)...`);

      const piIp = await discoverLanIp(piholeMachine);
      if (!piIp) {
        DR.logger.error(
          `Could not determine IP of ${piholeMachine}. Is it reachable?`
        );
        process.exit(1);
      }

      DR.logger.info(`${piholeMachine} LAN IP: ${piIp}`);

      // EdgeOS DHCP dns-server reference:
      // https://help.uisp.com/hc/en-us/articles/22591175599639-EdgeRouter-DHCP-Server
      return [
        'configure',
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
