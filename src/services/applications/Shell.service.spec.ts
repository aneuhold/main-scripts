import { beforeEach, describe, expect, it, vi } from 'vitest';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLI.service.js';
import ShellService from './Shell.service.js';

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
 * Columns are pid, pgid, tty, and command. Process 1968 trails another process
 * group and 618 owns no terminal, so neither is a session of its own.
 */
const PS_OUTPUT = [
  ' 1766  1766 ttys000  -zsh',
  ' 1968  1965 ttys000  -zsh',
  ' 2128  2128 ttys003  -zsh',
  ' 4199  4199 ttys025  /bin/zsh',
  '  618   618 ??       WindowServer',
  ' 5000  5000 ttys009  node'
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
 * Points each of the commands the service runs at its canned output.
 */
function mockCommandOutput(): void {
  vi.spyOn(CLIService, 'execCmd').mockImplementation((cmd: string) => {
    if (cmd.startsWith('ps ')) {
      return Promise.resolve({ didComplete: true, output: PS_OUTPUT });
    }
    if (cmd.startsWith('lsof ')) {
      return Promise.resolve({ didComplete: true, output: LSOF_OUTPUT });
    }
    if (cmd.startsWith('top ')) {
      return Promise.resolve({ didComplete: true, output: TOP_OUTPUT });
    }
    return Promise.resolve({ didComplete: false, output: '' });
  });
}

describe('ShellService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CurrentEnv, 'os', 'get').mockReturnValue(
      OperatingSystemType.MacOSX
    );
  });

  describe('getInteractiveShells', () => {
    it('should only return shells that lead a process group and own a terminal', async () => {
      mockCommandOutput();

      const sessions = await ShellService.getInteractiveShells();

      expect(sessions.map(({ pid }) => pid)).toEqual([1766, 2128, 4199]);
    });

    it('should pair each session with its directory and memory', async () => {
      mockCommandOutput();

      const sessions = await ShellService.getInteractiveShells();

      expect(sessions).toEqual([
        {
          pid: 1766,
          cwd: '/Users/test/repo-a',
          memoryBytes: 1.2 * 1024 ** 3
        },
        {
          pid: 2128,
          cwd: '/Users/test/repo-b',
          memoryBytes: 179 * 1024 ** 2
        },
        {
          pid: 4199,
          cwd: '/Users/test/repo-a',
          memoryBytes: 8992 * 1024
        }
      ]);
    });

    it('should return nothing when a session goes missing between lookups', async () => {
      vi.spyOn(CLIService, 'execCmd').mockImplementation((cmd: string) => {
        if (cmd.startsWith('ps ')) {
          return Promise.resolve({ didComplete: true, output: PS_OUTPUT });
        }
        return Promise.resolve({ didComplete: false, output: '' });
      });

      const sessions = await ShellService.getInteractiveShells();

      expect(sessions).toEqual([
        { pid: 1766, cwd: '', memoryBytes: 0 },
        { pid: 2128, cwd: '', memoryBytes: 0 },
        { pid: 4199, cwd: '', memoryBytes: 0 }
      ]);
    });

    it('should return an empty list on operating systems that are not covered', async () => {
      vi.spyOn(CurrentEnv, 'os', 'get').mockReturnValue(
        OperatingSystemType.Windows
      );

      const sessions = await ShellService.getInteractiveShells();

      expect(sessions).toEqual([]);
    });
  });
});
