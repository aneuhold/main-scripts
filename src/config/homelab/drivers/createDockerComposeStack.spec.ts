import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import { MainScriptsConfig } from '../../../services/ConfigService.js';
import { HomeLabMachine } from '../types.js';
import { createDockerComposeStack } from './createDockerComposeStack.js';

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

describe('createDockerComposeStack driver', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds children that inherit the parent machine', () => {
    const stack = createDockerComposeStack({
      name: 'monitoring',
      machine: HomeLabMachine.Pi2,
      remoteDir: '~/monitoring',
      files: [],
      services: ['pihole', 'grafana']
    });

    expect(stack.children.map((c) => c.name)).toEqual(['pihole', 'grafana']);
    for (const child of stack.children) {
      expect(child.machine).toBe(HomeLabMachine.Pi2);
    }
  });

  it('deploy writes files then runs compose up, in order', async () => {
    const writeSpy = vi
      .spyOn(HomeLabNetworkService, 'writeRemoteFile')
      .mockReturnValue(true);
    const runSpy = vi.spyOn(HomeLabNetworkService, 'sshRun').mockReturnValue(0);

    const stack = createDockerComposeStack({
      name: 'monitoring',
      machine: HomeLabMachine.Pi1,
      remoteDir: '~/monitoring',
      files: [['~/monitoring/docker-compose.yaml', 'compose-content']],
      env: () => [['~/monitoring/.env', 'env-content']],
      services: ['pihole']
    });

    const config: MainScriptsConfig = {};
    expect(stack.ops.deploy).toBeDefined();
    await stack.ops.deploy?.(config);

    expect(writeSpy).toHaveBeenCalledWith(
      HomeLabMachine.Pi1,
      '~/monitoring/docker-compose.yaml',
      'compose-content'
    );
    expect(writeSpy).toHaveBeenCalledWith(
      HomeLabMachine.Pi1,
      '~/monitoring/.env',
      'env-content'
    );
    expect(runSpy).toHaveBeenCalledWith(
      HomeLabMachine.Pi1,
      'cd ~/monitoring && docker compose up -d'
    );
    // compose up runs after the file writes
    expect(runSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
      writeSpy.mock.invocationCallOrder[1]
    );
  });

  it('status skips with a hint when the stack is not deployed', async () => {
    const dirSpy = vi
      .spyOn(HomeLabNetworkService, 'remoteDirExists')
      .mockResolvedValue(false);
    const runSpy = vi.spyOn(HomeLabNetworkService, 'sshRun').mockReturnValue(0);

    const stack = createDockerComposeStack({
      name: 'monitoring',
      machine: HomeLabMachine.Pi1,
      remoteDir: '~/monitoring',
      files: [],
      services: ['pihole']
    });

    await stack.ops.status?.();

    expect(dirSpy).toHaveBeenCalledWith(HomeLabMachine.Pi1, '~/monitoring');
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('status runs compose ps when the stack is deployed', async () => {
    vi.spyOn(HomeLabNetworkService, 'remoteDirExists').mockResolvedValue(true);
    const runSpy = vi.spyOn(HomeLabNetworkService, 'sshRun').mockReturnValue(0);

    const stack = createDockerComposeStack({
      name: 'monitoring',
      machine: HomeLabMachine.Pi1,
      remoteDir: '~/monitoring',
      files: [],
      services: ['pihole']
    });

    await stack.ops.status?.();

    expect(runSpy).toHaveBeenCalledWith(
      HomeLabMachine.Pi1,
      'cd ~/monitoring && docker compose ps'
    );
  });
});
