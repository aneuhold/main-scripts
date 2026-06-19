import { HomeLabMachine, MachineInfo, MachineKind } from './types.js';

/**
 * The single source of truth for every machine in the home lab: how to reach it
 * (SSH host) and what role it plays (kind). {@link HomeLabNetworkService} points
 * its SSH address book here, and selection/audit derive machine roles from the
 * {@link MachineKind} values rather than hand-maintained lists.
 */
export const MACHINES: Record<HomeLabMachine, MachineInfo> = {
  [HomeLabMachine.Pi1]: {
    user: 'neuholda',
    host: 'pi3-bplus-1.local',
    kind: MachineKind.DockerHost
  },
  [HomeLabMachine.Pi2]: {
    user: 'neuholda',
    host: 'pi3-b-1.local',
    kind: MachineKind.DockerHost
  },
  [HomeLabMachine.Router]: {
    user: 'ubnt',
    host: '192.168.0.2',
    kind: MachineKind.Router
  }
};
