import { MachineCapabilityDetector } from '../types.js';
import { dockerHostDetector } from './dockerHost.js';
import { routerDetector } from './router.js';

/**
 * Every machine-capability detector. {@link HomeLabReconcileService} runs each
 * one whose {@link MachineCapabilityDetector.appliesTo} includes a machine's
 * kind, so adding a capability (e.g. a systemd-service detector) means adding a
 * file here and appending it to this list — never editing the generic reconcile
 * core.
 */
export const CAPABILITY_DETECTORS: MachineCapabilityDetector[] = [
  dockerHostDetector,
  routerDetector
];
