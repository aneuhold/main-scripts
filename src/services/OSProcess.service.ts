import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import CurrentEnv, { OperatingSystemType } from '../utils/CurrentEnv.js';
import CLIService from './CLI.service.js';

export type ProcessInfo = {
  pid: number;
  /** The name the process runs under, with any path and login `-` prefix removed. */
  commandName: string;
  /**
   * Identifies the terminal the process is attached to, undefined when it is
   * attached to none. Check whether it is set, compare it against another
   * process's value to find the ones sharing a terminal, or show it as a
   * label. Its shape differs by OS, so nothing is read out of it or built
   * from it. Values look like:
   *
   * - Mac: `ttys003`
   * - Linux: `pts/3` or `tty1`
   * - Windows: `30796`, the PID of the terminal host it descends from
   *
   * Only present when {@link ProcessDetail.TerminalId} is requested.
   */
  terminalId?: string;
  /**
   * Whether the process heads its own group rather than belonging to a group
   * another process heads.
   *
   * Only present when {@link ProcessDetail.LeadsOwnGroup} is requested.
   */
  leadsOwnGroup?: boolean;
  /** Only present when {@link ProcessDetail.Cwd} is requested. */
  cwd?: string;
  /** Only present when {@link ProcessDetail.MemoryBytes} is requested. */
  memoryBytes?: number;
};

/**
 * A piece of information about a process that costs a lookup beyond the
 * listing itself, and so is gathered only when it is asked for.
 */
export enum ProcessDetail {
  TerminalId = 'terminalId',
  LeadsOwnGroup = 'leadsOwnGroup',
  Cwd = 'cwd',
  MemoryBytes = 'memoryBytes'
}

/**
 * A service that provides functionality for inspecting the processes running
 * on a machine.
 */
export default class OSProcessService {
  /**
   * Lists the processes on the machine, drops the ones the filter excludes,
   * then populates each requested detail for the survivors only.
   *
   * `pid` and `commandName` are the only fields every OS reports for free, so
   * they are always present and are all the filter sees. If you need to narrow based on something
   * in requestedDetails, make two requests.
   *
   * @param options what to narrow the listing down to and what to gather for
   * the survivors.
   * @param options.filter runs against every listed process. Details are
   * looked up only for the processes it keeps, so it sees `pid` and
   * `commandName` and nothing else.
   * @param options.requestedDetails the details to populate on the processes
   * the filter keeps.
   */
  public static async getProcessInfo(options?: {
    filter?: (process: ProcessInfo) => boolean;
    requestedDetails?: ProcessDetail[];
  }): Promise<ProcessInfo[]> {
    const { filter, requestedDetails = [] } = options ?? {};

    const listedProcesses = await OSProcessService.#listProcesses();
    const processes = filter
      ? listedProcesses.filter((process) => filter(process))
      : listedProcesses;

    const details = new Set(requestedDetails);
    if (processes.length === 0 || details.size === 0) {
      return processes;
    }

    const pids = processes.map(({ pid }) => pid);
    const needsTerminalOrGroup =
      details.has(ProcessDetail.TerminalId) ||
      details.has(ProcessDetail.LeadsOwnGroup);

    const [terminalAndGroup, directories, memoryUsage] = await Promise.all([
      needsTerminalOrGroup
        ? OSProcessService.#getTerminalAndGroup(pids)
        : undefined,
      details.has(ProcessDetail.Cwd)
        ? OSProcessService.#getWorkingDirectoriesOfPids(pids)
        : undefined,
      details.has(ProcessDetail.MemoryBytes)
        ? OSProcessService.#getMemoryUsageOfPids(pids)
        : undefined
    ]);

    return processes.map((process) => {
      const { pid } = process;
      const terminalAndGroupEntry = terminalAndGroup?.get(pid);
      const populatedProcess: ProcessInfo = { ...process };

      if (details.has(ProcessDetail.TerminalId)) {
        populatedProcess.terminalId = terminalAndGroupEntry?.terminalId;
      }
      if (details.has(ProcessDetail.LeadsOwnGroup)) {
        populatedProcess.leadsOwnGroup =
          terminalAndGroupEntry?.leadsOwnGroup ?? false;
      }
      if (details.has(ProcessDetail.Cwd)) {
        populatedProcess.cwd = directories?.get(pid);
      }
      if (details.has(ProcessDetail.MemoryBytes)) {
        populatedProcess.memoryBytes = memoryUsage?.get(pid);
      }

      return populatedProcess;
    });
  }

  /**
   * Lists every process on the machine with the fields the OS reports for
   * free.
   *
   * A login shell reports its command as `-zsh` and an explicit invocation
   * reports it as `/bin/zsh`, so the path and the leading `-` come off here
   * and every caller comparing names gets the same treatment.
   */
  static async #listProcesses(): Promise<ProcessInfo[]> {
    if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      const { didComplete, output } =
        await CLIService.execCmd('ps -axo pid=,comm=');

      if (!didComplete) {
        DR.logger.error('Could not list the processes on this machine.');
        return [];
      }

      return output
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .reduce<ProcessInfo[]>((processes, [pid, ...command]) => {
          if (!/^\d+$/.test(pid)) {
            return processes;
          }
          processes.push({
            pid: Number(pid),
            commandName: path.basename(command.join(' ')).replace(/^-/, '')
          });
          return processes;
        }, []);
    }

    DR.logger.error('Process listing is not defined for this OS yet.');
    return [];
  }

  /**
   * Maps each of the given process IDs to the terminal it is attached to and
   * whether it heads its own group.
   *
   * Both fields name a concept rather than a mechanism, so each OS maps its
   * own. On macOS `ps` reports the controlling terminal and the process group
   * directly, and a `??` terminal means the process is attached to none.
   *
   * @param pids the process IDs to look up
   */
  static async #getTerminalAndGroup(
    pids: number[]
  ): Promise<Map<number, { terminalId?: string; leadsOwnGroup: boolean }>> {
    if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      const { output } = await CLIService.execCmd(
        `ps -o pid=,pgid=,tty= -p ${pids.join(',')}`
      );

      const terminalAndGroup = new Map<
        number,
        { terminalId?: string; leadsOwnGroup: boolean }
      >();

      for (const line of output.split('\n')) {
        const [pid, pgid, tty] = line.trim().split(/\s+/);
        if (!/^\d+$/.test(pid) || !pgid) {
          continue;
        }
        terminalAndGroup.set(Number(pid), {
          terminalId: tty === '??' ? undefined : tty,
          leadsOwnGroup: pid === pgid
        });
      }

      return terminalAndGroup;
    }

    // Windows reports neither field, so a branch for it derives both by
    // walking `ParentProcessId` up to a terminal host such as
    // `WindowsTerminal.exe`, `conhost.exe`, `OpenConsole.exe`, or `sshd.exe`.
    // The terminal host's PID is the `terminalId`, and a process leads its own
    // group when that host is its direct parent rather than another shell.
    // `GetConsoleProcessList` cannot stand in for the walk, since it answers
    // only for the caller's own console. The walk runs in memory over the full
    // process listing rather than as a query per process, and each parent link
    // is checked against `CreationDate`, because Windows leaves the link stale
    // once the parent exits and recycles PIDs.
    DR.logger.error(
      'Terminal and process group lookup is not defined for this OS yet.'
    );
    return new Map();
  }

  /**
   * Maps each of the given process IDs to the directory it sits in.
   *
   * A missing entry is expected rather than a failure, since `lsof` reports a
   * directory only for live processes the current user owns.
   *
   * @param pids the process IDs to look up
   */
  static async #getWorkingDirectoriesOfPids(
    pids: number[]
  ): Promise<Map<number, string>> {
    if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      // `lsof` exits non-zero as soon as one process is gone, which would
      // throw away the output gathered for every other process.
      const { output } = await CLIService.execCmd(
        `lsof -a -d cwd -Fpn -p ${pids.join(',')} || true`
      );

      const directories = new Map<number, string>();
      let currentPid: number | undefined;

      for (const line of output.split('\n')) {
        const value = line.slice(1);
        if (line.startsWith('p')) {
          currentPid = Number(value);
        } else if (line.startsWith('n') && currentPid !== undefined) {
          directories.set(currentPid, value);
        }
      }

      return directories;
    }

    DR.logger.error('Working directory lookup is not defined for this OS yet.');
    return new Map();
  }

  /**
   * Maps each of the given process IDs to the bytes of memory it holds.
   *
   * On macOS this reads the physical footprint rather than the resident size
   * so that pages the system has compressed still count.
   *
   * @param pids the process IDs to look up
   */
  static async #getMemoryUsageOfPids(
    pids: number[]
  ): Promise<Map<number, number>> {
    if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      const pidArgs = pids.map((pid) => `-pid ${pid}`).join(' ');
      const { output } = await CLIService.execCmd(
        `top -l 1 -stats pid,mem ${pidArgs}`
      );

      const memoryUsage = new Map<number, number>();

      for (const line of output.split('\n')) {
        const [pid, memory] = line.trim().split(/\s+/);
        if (!/^\d+$/.test(pid) || !memory) {
          continue;
        }
        memoryUsage.set(
          Number(pid),
          OSProcessService.#parseTopMemoryValue(memory)
        );
      }

      return memoryUsage;
    }

    DR.logger.error('Memory usage lookup is not defined for this OS yet.');
    return new Map();
  }

  /**
   * Converts a memory value reported by `top`, such as `179M`, into bytes.
   *
   * @param value the memory value to convert
   */
  static #parseTopMemoryValue(value: string): number {
    const match = /^([\d.]+)([BKMGT]?)$/.exec(value);
    if (!match) {
      return 0;
    }

    const [, amount, unit] = match;
    const multipliers: Record<string, number> = {
      B: 1,
      K: 1024,
      M: 1024 ** 2,
      G: 1024 ** 3,
      T: 1024 ** 4
    };

    return Number(amount) * (multipliers[unit] ?? 1);
  }
}
