import { beforeEach, describe, expect, it, vi } from 'vitest';
import CurrentEnv, { OperatingSystemType } from '../utils/CurrentEnv.js';
import CLIService from './CLI.service.js';
import OSProcessService, { ProcessDetail } from './OSProcess.service.js';

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
        verbose: {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn()
        }
      }
    }
  };
});

/**
 * Columns are pid and command. A login shell reports as `-zsh` and an explicit
 * invocation reports as `/bin/zsh`.
 */
const PS_LIST_OUTPUT = [
  ' 1766  -zsh',
  ' 1968  -zsh',
  ' 2128  -zsh',
  ' 4199  /bin/zsh',
  '  618  /System/Library/PrivateFrameworks/WindowServer',
  ' 5000  node'
].join('\n');

/**
 * Columns are pid, pgid, and tty. Process 1968 trails another process group
 * and 618 owns no terminal.
 */
const PS_TERMINAL_OUTPUT = [
  ' 1766  1766 ttys000',
  ' 1968  1965 ttys000',
  ' 2128  2128 ttys003',
  ' 4199  4199 ttys025',
  '  618   618 ??',
  ' 5000  5000 ttys009'
].join('\n');

const LSOF_OUTPUT = [
  'p1766',
  'fcwd',
  'n/Users/test/repo-a',
  'p2128',
  'fcwd',
  'n/Users/test/repo-b',
  'p4199',
  'fcwd',
  'n/Users/test/repo-a'
].join('\n');

const TOP_OUTPUT = [
  'Processes: 681 total, 5 running, 676 sleeping',
  'Load Avg: 3.56, 3.01, 2.65',
  'MemRegions: 929566 total, 6113M resident',
  '',
  'PID   MEM',
  '4199  8992K',
  '2128  179M',
  '1766  1.2G'
].join('\n');

/**
 * Points each of the commands the service runs at its canned output, and
 * records the commands so a test can check which IDs were carried into them.
 */
function mockCommandOutput(): string[] {
  const executedCommands: string[] = [];

  vi.spyOn(CLIService, 'execCmd').mockImplementation((cmd: string) => {
    executedCommands.push(cmd);
    if (cmd.includes('pgid=')) {
      return Promise.resolve({
        didComplete: true,
        output: PS_TERMINAL_OUTPUT
      });
    }
    if (cmd.startsWith('ps ')) {
      return Promise.resolve({ didComplete: true, output: PS_LIST_OUTPUT });
    }
    if (cmd.startsWith('lsof ')) {
      return Promise.resolve({ didComplete: true, output: LSOF_OUTPUT });
    }
    if (cmd.startsWith('top ')) {
      return Promise.resolve({ didComplete: true, output: TOP_OUTPUT });
    }
    return Promise.resolve({ didComplete: false, output: '' });
  });

  return executedCommands;
}

describe('OSProcessService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CurrentEnv, 'os', 'get').mockReturnValue(
      OperatingSystemType.MacOSX
    );
  });

  describe('getProcessInfo', () => {
    it('should return every process with only the always present fields when nothing is asked for', async () => {
      mockCommandOutput();

      const processes = await OSProcessService.getProcessInfo();

      expect(processes).toEqual([
        { pid: 1766, commandName: 'zsh' },
        { pid: 1968, commandName: 'zsh' },
        { pid: 2128, commandName: 'zsh' },
        { pid: 4199, commandName: 'zsh' },
        { pid: 618, commandName: 'WindowServer' },
        { pid: 5000, commandName: 'node' }
      ]);
    });

    it('should carry only the surviving IDs into the detail lookups', async () => {
      const executedCommands = mockCommandOutput();

      const processes = await OSProcessService.getProcessInfo({
        filter: ({ commandName }) => commandName === 'node',
        requestedDetails: [ProcessDetail.Cwd, ProcessDetail.MemoryBytes]
      });

      expect(processes.map(({ pid }) => pid)).toEqual([5000]);
      expect(executedCommands.find((cmd) => cmd.startsWith('lsof '))).toContain(
        '-p 5000'
      );
      expect(executedCommands.find((cmd) => cmd.startsWith('top '))).toContain(
        '-pid 5000'
      );
    });

    it('should run no detail lookups when the filter keeps nothing', async () => {
      const executedCommands = mockCommandOutput();

      const processes = await OSProcessService.getProcessInfo({
        filter: ({ commandName }) => commandName === 'not-a-real-command',
        requestedDetails: [ProcessDetail.MemoryBytes]
      });

      expect(processes).toEqual([]);
      expect(executedCommands.filter((cmd) => cmd.startsWith('top '))).toEqual(
        []
      );
    });

    it('should populate only the requested details', async () => {
      mockCommandOutput();

      const [workingDirectoryOnly] = await OSProcessService.getProcessInfo({
        filter: ({ pid }) => pid === 2128,
        requestedDetails: [ProcessDetail.Cwd]
      });

      expect(workingDirectoryOnly).toEqual({
        pid: 2128,
        commandName: 'zsh',
        cwd: '/Users/test/repo-b'
      });

      const [memoryOnly] = await OSProcessService.getProcessInfo({
        filter: ({ pid }) => pid === 2128,
        requestedDetails: [ProcessDetail.MemoryBytes]
      });

      expect(memoryOnly).toEqual({
        pid: 2128,
        commandName: 'zsh',
        memoryBytes: 179 * 1024 ** 2
      });
    });

    it('should map the terminal and the group leadership of each process', async () => {
      mockCommandOutput();

      const processes = await OSProcessService.getProcessInfo({
        requestedDetails: [
          ProcessDetail.TerminalId,
          ProcessDetail.LeadsOwnGroup
        ]
      });

      expect(
        processes.map(({ pid, terminalId, leadsOwnGroup }) => ({
          pid,
          terminalId,
          leadsOwnGroup
        }))
      ).toEqual([
        { pid: 1766, terminalId: 'ttys000', leadsOwnGroup: true },
        { pid: 1968, terminalId: 'ttys000', leadsOwnGroup: false },
        { pid: 2128, terminalId: 'ttys003', leadsOwnGroup: true },
        { pid: 4199, terminalId: 'ttys025', leadsOwnGroup: true },
        { pid: 618, terminalId: undefined, leadsOwnGroup: true },
        { pid: 5000, terminalId: 'ttys009', leadsOwnGroup: true }
      ]);
    });

    it('should strip the path and the login prefix off the command name', async () => {
      mockCommandOutput();

      const processes = await OSProcessService.getProcessInfo({
        filter: ({ pid }) => pid === 1766 || pid === 4199
      });

      expect(processes).toEqual([
        { pid: 1766, commandName: 'zsh' },
        { pid: 4199, commandName: 'zsh' }
      ]);
    });

    it('should leave a detail undefined when the lookup has nothing for the process', async () => {
      mockCommandOutput();

      const [process] = await OSProcessService.getProcessInfo({
        filter: ({ pid }) => pid === 5000,
        requestedDetails: [ProcessDetail.Cwd, ProcessDetail.MemoryBytes]
      });

      expect(process).toEqual({
        pid: 5000,
        commandName: 'node',
        cwd: undefined,
        memoryBytes: undefined
      });
    });

    it('should convert every memory unit that top reports', async () => {
      vi.spyOn(CLIService, 'execCmd').mockImplementation((cmd: string) => {
        if (cmd.startsWith('top ')) {
          return Promise.resolve({
            didComplete: true,
            output: [
              'PID   MEM',
              '1  512B',
              '2  8992K',
              '3  179M',
              '4  1.2G',
              '5  2T',
              '6  unparseable'
            ].join('\n')
          });
        }
        return Promise.resolve({
          didComplete: true,
          output: [
            '1  zsh',
            '2  zsh',
            '3  zsh',
            '4  zsh',
            '5  zsh',
            '6  zsh'
          ].join('\n')
        });
      });

      const processes = await OSProcessService.getProcessInfo({
        requestedDetails: [ProcessDetail.MemoryBytes]
      });

      expect(processes.map(({ memoryBytes }) => memoryBytes)).toEqual([
        512,
        8992 * 1024,
        179 * 1024 ** 2,
        1.2 * 1024 ** 3,
        2 * 1024 ** 4,
        0
      ]);
    });

    it('should return an empty list on operating systems that are not covered', async () => {
      vi.spyOn(CurrentEnv, 'os', 'get').mockReturnValue(
        OperatingSystemType.Windows
      );
      mockCommandOutput();

      const processes = await OSProcessService.getProcessInfo({
        requestedDetails: [ProcessDetail.MemoryBytes]
      });

      expect(processes).toEqual([]);
    });
  });
});
