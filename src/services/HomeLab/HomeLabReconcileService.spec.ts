import { describe, expect, it, vi } from 'vitest';
import { createDockerComposeStack } from '../../config/homelab/drivers/createDockerComposeStack.js';
import {
  DriftStatus,
  HomeLabMachine,
  MachineProbe,
  ProbeContext
} from '../../config/homelab/types.js';
import HomeLabReconcileService from './HomeLabReconcileService.js';

// Mock the logger to avoid console noise during tests
vi.mock('@aneuhold/core-ts-lib', async () => {
  const actual = await vi.importActual('@aneuhold/core-ts-lib');
  return {
    ...actual,
    DR: {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
        verbose: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      }
    }
  };
});

/**
 * Builds a probe context from a per-machine list of running container names.
 * Machines absent from the map are treated as reachable docker hosts with no
 * containers.
 *
 * @param running running container names keyed by machine
 */
function makeContext(
  running: Partial<Record<HomeLabMachine, string[]>>
): ProbeContext {
  const probe = (machine: HomeLabMachine): MachineProbe => ({
    reachable: true,
    dockerOk: true,
    running: new Set(running[machine] ?? []),
    stopped: new Set()
  });
  return {
    machines: {
      [HomeLabMachine.Pi1]: probe(HomeLabMachine.Pi1),
      [HomeLabMachine.Pi2]: probe(HomeLabMachine.Pi2),
      [HomeLabMachine.Router]: {
        reachable: true,
        dockerOk: false,
        running: new Set(),
        stopped: new Set()
      }
    }
  };
}

describe('HomeLabReconcileService', () => {
  const stack = createDockerComposeStack({
    name: 'test-stack',
    machine: HomeLabMachine.Pi2,
    remoteDir: '~/test',
    files: [],
    services: ['svc-a', 'svc-b']
  });

  it('classifies a stack observed on the wrong machine as Misplaced', async () => {
    // Desired on Pi2 but its containers are running on Pi1.
    const ctx = makeContext({ [HomeLabMachine.Pi1]: ['svc-a', 'svc-b'] });
    vi.spyOn(HomeLabReconcileService, 'buildProbeContext').mockResolvedValue(
      ctx
    );

    const plan = await HomeLabReconcileService.reconcile([stack]);

    const item = plan.items.find((i) => i.deployable.name === 'test-stack');
    expect(item?.status).toBe(DriftStatus.Misplaced);
  });

  it('plans teardown-on-Pi1 and deploy-on-Pi2 for the misplacement', async () => {
    const ctx = makeContext({ [HomeLabMachine.Pi1]: ['svc-a', 'svc-b'] });
    vi.spyOn(HomeLabReconcileService, 'buildProbeContext').mockResolvedValue(
      ctx
    );

    const plan = await HomeLabReconcileService.reconcile([stack]);

    const teardown = plan.actions.find((a) => a.op === 'teardown');
    expect(teardown?.machine).toBe(HomeLabMachine.Pi1);
    // onMachine re-binds the deployable to the machine it is wrongly running on.
    expect(teardown?.deployable.machine).toBe(HomeLabMachine.Pi1);

    const deploy = plan.actions.find((a) => a.op === 'deploy');
    expect(deploy?.machine).toBe(HomeLabMachine.Pi2);
    expect(deploy?.deployable.machine).toBe(HomeLabMachine.Pi2);
  });

  it('classifies a stack on its desired machine as Ok with no actions', async () => {
    const ctx = makeContext({ [HomeLabMachine.Pi2]: ['svc-a', 'svc-b'] });
    vi.spyOn(HomeLabReconcileService, 'buildProbeContext').mockResolvedValue(
      ctx
    );

    const plan = await HomeLabReconcileService.reconcile([stack]);

    const item = plan.items.find((i) => i.deployable.name === 'test-stack');
    expect(item?.status).toBe(DriftStatus.Ok);
    expect(plan.actions).toHaveLength(0);
  });

  it('flags containers matching no registry deployable as Unmanaged', async () => {
    const ctx = makeContext({ [HomeLabMachine.Pi1]: ['rogue-container'] });
    vi.spyOn(HomeLabReconcileService, 'buildProbeContext').mockResolvedValue(
      ctx
    );

    const plan = await HomeLabReconcileService.reconcile([stack]);

    const unmanaged = plan.items.find(
      (i) => i.deployable.name === 'rogue-container'
    );
    expect(unmanaged?.status).toBe(DriftStatus.Unmanaged);
  });
});
