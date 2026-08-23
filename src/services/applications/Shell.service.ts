import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import CurrentEnv, {
  OperatingSystemType,
  ShellType
} from '../../utils/CurrentEnv.js';
import CLIService from '../CLI.service.js';

export type InteractiveShellInfo = {
  /**
   * Process ID
   */
  pid: number;
  /**
   * The directory the shell currently sits in.
   */
  cwd: string;
  /**
   * The memory the shell is responsible for, counting pages the system has
   * compressed as well as the ones held in standard memory.
   */
  memoryBytes: number;
};

/**
 * A service that provides functionality for inspecting or working with the
 * shells running on a machine.
 */
export default class ShellService {
  /**
   * Gets every interactive shell on the machine, along with the directory it
   * sits in and the memory it holds.
   *
   * An interactive shell is one a person drives from a terminal, rather than
   * one a script or a prompt framework runs in the background.
   */
  public static async getInteractiveShells(): Promise<InteractiveShellInfo[]> {
    switch (CurrentEnv.os) {
      case OperatingSystemType.MacOSX:
        return ShellService.#getMacOsInteractiveShells();
      default:
        DR.logger.error(
          'Interactive shell lookup is not defined for this OS yet.'
        );
        return [];
    }
  }

  /**
   * Gets the interactive shells running on a macOS machine. They can be of any
   * shell type, since a shell such as `pwsh` runs on more than one OS.
   */
  static async #getMacOsInteractiveShells(): Promise<InteractiveShellInfo[]> {
    const pids = await ShellService.#getShellProcessIds();
    if (pids.length === 0) {
      return [];
    }

    const [directories, memoryUsage] = await Promise.all([
      ShellService.#getWorkingDirectoriesOfPids(pids),
      ShellService.#getMemoryUsageOfPids(pids)
    ]);

    return pids.map((pid) => ({
      pid,
      cwd: directories.get(pid) ?? '',
      memoryBytes: memoryUsage.get(pid) ?? 0
    }));
  }

  /**
   * Gets the IDs of the processes that are interactive shells.
   *
   * On macOS a shell qualifies when it leads its own process group and owns a
   * terminal, which leaves out the shells that run in the background.
   */
  static async #getShellProcessIds(): Promise<number[]> {
    if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      const { didComplete, output } = await CLIService.execCmd(
        'ps -axo pid=,pgid=,tty=,comm='
      );

      if (!didComplete) {
        DR.logger.error('Could not list the processes on this machine.');
        return [];
      }

      // Widened to `string[]` so a command name read off the system can be
      // checked against it.
      const shellCommandNames: string[] = Object.values(ShellType);

      return output
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .reduce<number[]>((pids, [pid, pgid, tty, ...command]) => {
          const commandName = path
            .basename(command.join(' '))
            .replace(/^-/, '');
          if (
            pid === pgid &&
            tty !== '??' &&
            shellCommandNames.includes(commandName)
          ) {
            pids.push(Number(pid));
          }
          return pids;
        }, []);
    }

    DR.logger.error('Shell process lookup is not defined for this OS yet.');
    return [];
  }

  /**
   * Maps each of the given process IDs to the directory it sits in.
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
        memoryUsage.set(Number(pid), ShellService.#parseTopMemoryValue(memory));
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
