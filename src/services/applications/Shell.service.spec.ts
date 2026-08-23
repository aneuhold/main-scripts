import { beforeEach, describe, expect, it, vi } from 'vitest';
import OSProcessService, {
  ProcessDetail,
  ProcessInfo
} from '../OSProcess.service.js';
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
 * Process 1968 trails another process group, 618 is not a shell, and 5000 owns
 * a terminal but is not a shell either.
 */
const PROCESSES: ProcessInfo[] = [
  {
    pid: 1766,
    commandName: 'zsh',
    terminalId: 'ttys000',
    leadsOwnGroup: true,
    cwd: '/Users/test/repo-a',
    memoryBytes: 1.2 * 1024 ** 3
  },
  {
    pid: 1968,
    commandName: 'zsh',
    terminalId: 'ttys000',
    leadsOwnGroup: false,
    cwd: '/Users/test/repo-a',
    memoryBytes: 5 * 1024 ** 2
  },
  {
    pid: 2128,
    commandName: 'zsh',
    terminalId: 'ttys003',
    leadsOwnGroup: true,
    cwd: '/Users/test/repo-b',
    memoryBytes: 179 * 1024 ** 2
  },
  {
    pid: 4199,
    commandName: 'zsh',
    terminalId: 'ttys025',
    leadsOwnGroup: true,
    cwd: '/Users/test/repo-a',
    memoryBytes: 8992 * 1024
  },
  {
    pid: 6100,
    commandName: 'pwsh',
    terminalId: undefined,
    leadsOwnGroup: true,
    cwd: '/Users/test/repo-c',
    memoryBytes: 12 * 1024 ** 2
  },
  {
    pid: 618,
    commandName: 'WindowServer',
    terminalId: undefined,
    leadsOwnGroup: true,
    cwd: '/',
    memoryBytes: 300 * 1024 ** 2
  },
  {
    pid: 5000,
    commandName: 'node',
    terminalId: 'ttys009',
    leadsOwnGroup: true,
    cwd: '/Users/test/repo-b',
    memoryBytes: 90 * 1024 ** 2
  }
];

/**
 * Answers each call out of the fixture the same way the service does, by
 * filtering first and populating only the requested details.
 *
 * @param processes the processes the machine is standing in for
 */
function mockProcessInfo(processes: ProcessInfo[] = PROCESSES) {
  return vi
    .spyOn(OSProcessService, 'getProcessInfo')
    .mockImplementation((options) => {
      const { filter, requestedDetails = [] } = options ?? {};
      const details = new Set(requestedDetails);

      const survivors = processes.filter(({ pid, commandName }) =>
        filter ? filter({ pid, commandName }) : true
      );

      return Promise.resolve(
        survivors.map(
          ({
            pid,
            commandName,
            terminalId,
            leadsOwnGroup,
            cwd,
            memoryBytes
          }) => {
            const populatedProcess: ProcessInfo = { pid, commandName };

            if (details.has(ProcessDetail.TerminalId)) {
              populatedProcess.terminalId = terminalId;
            }
            if (details.has(ProcessDetail.LeadsOwnGroup)) {
              populatedProcess.leadsOwnGroup = leadsOwnGroup;
            }
            if (details.has(ProcessDetail.Cwd)) {
              populatedProcess.cwd = cwd;
            }
            if (details.has(ProcessDetail.MemoryBytes)) {
              populatedProcess.memoryBytes = memoryBytes;
            }

            return populatedProcess;
          }
        )
      );
    });
}

describe('ShellService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInteractiveShellsProcessInfo', () => {
    it('should only return shells that lead a process group and own a terminal', async () => {
      mockProcessInfo();

      const sessions = await ShellService.getInteractiveShellsProcessInfo();

      expect(sessions.map(({ pid }) => pid)).toEqual([1766, 2128, 4199]);
    });

    it('should narrow on the command name before asking for any detail', async () => {
      const getProcessInfo = mockProcessInfo();

      await ShellService.getInteractiveShellsProcessInfo();

      const [firstCall] = getProcessInfo.mock.calls[0];
      const survivingCommandNames = PROCESSES.filter(
        ({ pid, commandName }) =>
          firstCall?.filter?.({ pid, commandName }) === true
      ).map(({ commandName }) => commandName);

      expect(new Set(survivingCommandNames)).toEqual(new Set(['zsh', 'pwsh']));
      expect(firstCall?.requestedDetails).toEqual([
        ProcessDetail.TerminalId,
        ProcessDetail.LeadsOwnGroup
      ]);
    });

    it('should pair each session with its directory and memory', async () => {
      mockProcessInfo();

      const sessions = await ShellService.getInteractiveShellsProcessInfo();

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

    it('should fall back to empty values when a detail is missing', async () => {
      mockProcessInfo(
        PROCESSES.map((process) =>
          process.pid === 2128
            ? { ...process, cwd: undefined, memoryBytes: undefined }
            : process
        )
      );

      const sessions = await ShellService.getInteractiveShellsProcessInfo();

      expect(sessions).toContainEqual({ pid: 2128, cwd: '', memoryBytes: 0 });
    });

    it('should return an empty list when no process is a shell', async () => {
      mockProcessInfo([]);

      const sessions = await ShellService.getInteractiveShellsProcessInfo();

      expect(sessions).toEqual([]);
    });
  });
});
