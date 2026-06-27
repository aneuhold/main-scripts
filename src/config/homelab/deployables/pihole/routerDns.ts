import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../../services/HomeLab/HomeLabNetwork.service.js';
import {
  createRouterConfig,
  createRouterConfigGuardedDeletes
} from '../../drivers/createRouterConfig.js';
import { MACHINES } from '../../machines.js';
import { HomeLabMachine } from '../../types.js';

/**
 * The single LAN subnet served by the router's DHCP shared-network.
 */
export const LAN_SUBNET: string = '192.168.0.0/24';

const ROUTER_LAN_IP = MACHINES[HomeLabMachine.Router].host;

/**
 * Router side of Pi-hole client naming: advertise Pi-hole as the DNS server in
 * the router's DHCP leases, and switch the router's DHCP backend from ISC dhcpd
 * to dnsmasq. Both stay on the router; only dnsmasq shares its leases with the
 * router's DNS, which is what lets conditional forwarding resolve client names.
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
    label: 'router DNS for PiHole',
    machine: HomeLabMachine.Router,
    dependsOn,
    verify: async () => {
      const piIp = await HomeLabNetworkService.discoverLanIp(piholeMachine);
      if (!piIp) {
        return false;
      }

      // Two cli-shell-api verbs: dns-server is multi-value (plural
      // returnActiveValues), use-dnsmasq is a single-value leaf (singular
      // returnActiveValue) that reads `disable` until enabled.
      const [dnsServer, useDnsmasq] =
        await HomeLabNetworkService.sshCaptureEach(HomeLabMachine.Router, [
          `cli-shell-api returnActiveValues service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server`,
          'cli-shell-api returnActiveValue service dhcp-server use-dnsmasq'
        ]);
      return dnsServer.includes(piIp) && useDnsmasq.includes('enable');
    },
    teardownCommands: () => [
      'configure',
      // Restore the baseline: router hands out itself as DNS again, and the DHCP
      // backend reverts to ISC dhcpd. dns-server is multi-value, so clear before
      // re-setting rather than appending.
      ...createRouterConfigGuardedDeletes([
        `service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server`
      ]),
      `set service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server ${ROUTER_LAN_IP}`,
      ...createRouterConfigGuardedDeletes(['service dhcp-server use-dnsmasq']),
      'commit',
      'save',
      'exit'
    ],
    buildCommands: async () => {
      DR.logger.info(`Discovering IP of ${piholeMachine} (hosts Pi-hole)...`);

      const piIp = await HomeLabNetworkService.discoverLanIp(piholeMachine);
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
        // dns-server is multi-value, so clear-then-set replaces it instead of
        // adding a second resolver. One commit, so clients never see zero
        // resolvers mid-change.
        ...createRouterConfigGuardedDeletes([
          `service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server`
        ]),
        `set service dhcp-server shared-network-name LAN subnet ${LAN_SUBNET} dns-server ${piIp}`,
        // Swap the router's DHCP backend to dnsmasq (see fn doc).
        'set service dhcp-server use-dnsmasq enable',
        'commit',
        'save',
        'exit'
      ];
    }
  });
