import { MachineCapabilityDetector, MachineKind } from '../types.js';

/**
 * The router capability. The router currently exposes no state beyond the
 * universal SSH reachability that {@link MachineSnapshot.reachable} already
 * carries, so `detect` contributes nothing today. This is the home for future
 * router-specific detection (e.g. parsing EdgeRouter `show`-command output to
 * verify applied config), which would add a field to {@link MachineSnapshot} and
 * fill it in here, without touching the generic reconcile core.
 */
export const routerDetector: MachineCapabilityDetector = {
  appliesTo: [MachineKind.Router],
  detect: () => Promise.resolve({})
};
