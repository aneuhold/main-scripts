import { ShellType } from '../../utils/CurrentEnv.js';
import OSProcessService, { ProcessDetail } from '../OSProcess.service.js';

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
   * one a script or a prompt framework runs in the background. Terminal
   * attachment alone does not make a process interactive, since a process
   * inherits it from its parent and keeps it while running unattended. The
   * claim comes from combining attachment with group leadership and a shell
   * command name.
   */
  public static async getInteractiveShellsProcessInfo(): Promise<
    {
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
    }[]
  > {
    // Widened to `string[]` so a command name read off the system can be
    // checked against it.
    const shellCommandNames: string[] = Object.values(ShellType);

    const candidates = await OSProcessService.getProcessInfo({
      filter: ({ commandName }) => shellCommandNames.includes(commandName),
      requestedDetails: [ProcessDetail.TerminalId, ProcessDetail.LeadsOwnGroup]
    });

    const shellPids = new Set(
      candidates
        .filter(
          ({ leadsOwnGroup, terminalId }) =>
            leadsOwnGroup && terminalId !== undefined
        )
        .map(({ pid }) => pid)
    );

    const shells = await OSProcessService.getProcessInfo({
      filter: ({ pid }) => shellPids.has(pid),
      requestedDetails: [ProcessDetail.Cwd, ProcessDetail.MemoryBytes]
    });

    return shells.map(({ pid, cwd, memoryBytes }) => ({
      pid,
      cwd: cwd ?? '',
      memoryBytes: memoryBytes ?? 0
    }));
  }
}
