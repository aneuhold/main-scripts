import { DR } from '@aneuhold/core-ts-lib';
import { spawnSync } from 'child_process';
import { MACHINES } from '../../config/homelab/machines.js';
import { HomeLabMachine } from '../../config/homelab/types.js';

/**
 * Low-level SSH and utility mechanics for the home lab — the single layer that
 * knows how to reach a machine (via the {@link MACHINES} registry) and run
 * commands on it. Command-level orchestration and logging live in the higher
 * level services and the homelab command.
 */
export default class HomeLabNetworkService {
  /**
   * Returns the SSH connection string (user@host) for the given machine.
   *
   * @param machine the target machine
   */
  static sshHost(machine: HomeLabMachine): string {
    return MACHINES[machine].sshHost;
  }

  /**
   * Runs a command on the given machine via SSH, streaming stdio directly to
   * the terminal. Returns the remote exit code.
   *
   * @param machine the target machine
   * @param command shell command to run on the remote machine
   */
  static sshRun(machine: HomeLabMachine, command: string): number {
    const result = spawnSync('ssh', [MACHINES[machine].sshHost, command], {
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
    args.push(MACHINES[machine].sshHost, command);
    const result = spawnSync('ssh', args, { encoding: 'utf8' });
    return {
      output: result.stdout.trim(),
      exitCode: result.status ?? 1
    };
  }

  /**
   * Runs a non-interactive SSH session on the given machine, piping `input` to
   * its stdin. Used to feed a batch of commands to a remote shell. Returns the
   * remote exit code.
   *
   * @param machine the target machine
   * @param input text piped to the remote session's stdin
   */
  static sshRunWithInput(machine: HomeLabMachine, input: string): number {
    const result = spawnSync('ssh', [MACHINES[machine].sshHost, '-T'], {
      input,
      stdio: ['pipe', 'inherit', 'inherit']
    });
    return result.status ?? 0;
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
        MACHINES[machine].sshHost,
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
   * Returns true if the given directory exists on the machine.
   *
   * @param machine the target machine
   * @param remotePath the directory path to check
   */
  static remoteDirExists(machine: HomeLabMachine, remotePath: string): boolean {
    const result = this.sshCapture(machine, `test -d ${remotePath} && echo ok`);
    return result.output === 'ok';
  }
}
