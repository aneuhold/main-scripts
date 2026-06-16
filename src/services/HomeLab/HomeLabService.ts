import { DR } from '@aneuhold/core-ts-lib';
import { spawnSync } from 'child_process';
import {
  HomeLabMachine,
  MACHINE_SSH
} from '../../config/homelab/homeLabNetworkMap.js';

/**
 * Low-level SSH and utility operations for the home lab. Command-level
 * orchestration and logging live in the homelab command; this service handles
 * the self-contained mechanics.
 */
export default class HomeLabService {
  /**
   * Runs a command on the given machine via SSH, streaming stdio directly to
   * the terminal. Returns the remote exit code.
   *
   * @param machine the target machine
   * @param command shell command to run on the remote machine
   */
  static sshRun(machine: HomeLabMachine, command: string): number {
    const result = spawnSync('ssh', [MACHINE_SSH[machine], command], {
      stdio: 'inherit'
    });
    return result.status ?? 0;
  }

  /**
   * Runs a command on the given machine via SSH and captures stdout. Does not
   * stream to the terminal. Useful for audit-style checks where the output
   * needs to be inspected programmatically.
   *
   * @param machine the target machine
   * @param command shell command to run on the remote machine
   * @param connectTimeout optional SSH ConnectTimeout in seconds; also enables
   *   BatchMode to prevent interactive prompts from blocking the process
   */
  static sshCapture(
    machine: HomeLabMachine,
    command: string,
    connectTimeout?: number
  ): {
    output: string;
    exitCode: number;
  } {
    const args: string[] = [];
    if (connectTimeout !== undefined) {
      args.push(
        '-o',
        `ConnectTimeout=${connectTimeout}`,
        '-o',
        'BatchMode=yes'
      );
    }
    args.push(MACHINE_SSH[machine], command);
    const result = spawnSync('ssh', args, { encoding: 'utf8' });
    return {
      output: result.stdout.trim(),
      exitCode: result.status ?? 1
    };
  }

  /**
   * Writes a file on the given machine by piping content through SSH stdin.
   * Creates parent directories as needed. Returns true on success.
   *
   * @param machine the target machine
   * @param remotePath tilde-prefixed or absolute path on the remote machine
   * @param content file content to write
   */
  static writeRemoteFile(
    machine: HomeLabMachine,
    remotePath: string,
    content: string
  ): boolean {
    const result = spawnSync(
      'ssh',
      [
        MACHINE_SSH[machine],
        `mkdir -p "$(dirname '${remotePath}')" && cat > '${remotePath}'`
      ],
      { input: content, stdio: ['pipe', 'inherit', 'inherit'] }
    );
    if ((result.status ?? 1) !== 0) {
      DR.logger.error(`Failed to write ${remotePath} on ${machine}`);
      return false;
    }
    return true;
  }

  /**
   * Parses a newline-delimited list of container names from `docker ps` output,
   * ignoring empty lines.
   *
   * @param output raw stdout from a docker ps --format command
   */
  static parseContainerNames(output: string): string[] {
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
}
