import { DR } from '@aneuhold/core-ts-lib';
import { spawn, spawnSync } from 'child_process';
import { MACHINES } from '../../config/homelab/machines.js';
import { HomeLabMachine } from '../../config/homelab/types.js';
import CliLogger from '../../utils/CliLogger.js';

/**
 * Milliseconds an SSH command may stay silent before a spinner appears.
 */
const SSH_SPINNER_DELAY_MS = 500;

/**
 * Low-level SSH and utility mechanics for the home lab. The single layer that
 * knows how to reach a machine (via the {@link MACHINES} registry) and run
 * commands on it. Command-level orchestration and logging live in the higher
 * level services and the homelab command.
 *
 * Every command-running primitive wraps its work in a delayed
 * {@link CliLogger.spinner}, so any SSH call that stalls surfaces a loading
 * indicator without callers doing anything.
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
   * Runs a command on the given machine via SSH, streaming its output to the
   * terminal as it arrives. Resolves with the remote exit code.
   *
   * @param machine the target machine
   * @param command shell command to run on the remote machine
   */
  static sshRun(machine: HomeLabMachine, command: string): Promise<number> {
    return this.runStreaming(machine, [MACHINES[machine].sshHost, command]);
  }

  /**
   * Runs a command on the given machine via SSH and captures stdout. Does not
   * stream to the terminal. Useful for audit-style checks where the output needs
   * to be inspected programmatically. Async (non-blocking `spawn`) so the event
   * loop stays free for concurrent callers and spinner animation. Surfaces a
   * loading indicator via {@link CliLogger.idleSpinner} if the call runs long.
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
  ): Promise<{
    output: string;
    exitCode: number;
  }> {
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
    const spinner = CliLogger.spinner(`Waiting on ${machine}...`, {
      delayMs: SSH_SPINNER_DELAY_MS
    });
    return new Promise((resolve) => {
      let stdout = '';
      const child = spawn('ssh', args);
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.on('error', () => {
        spinner.stop();
        resolve({ output: '', exitCode: 1 });
      });
      child.on('close', (code) => {
        spinner.stop();
        resolve({ output: stdout.trim(), exitCode: code ?? 1 });
      });
    });
  }

  /**
   * Runs a non-interactive SSH session on the given machine, piping `input` to
   * its stdin and streaming its output as it arrives. Used to feed a batch of
   * commands to a remote shell. Resolves with the remote exit code.
   *
   * @param machine the target machine
   * @param input text piped to the remote session's stdin
   */
  static sshRunWithInput(
    machine: HomeLabMachine,
    input: string
  ): Promise<number> {
    return this.runStreaming(machine, [MACHINES[machine].sshHost, '-T'], input);
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
  static async remoteDirExists(
    machine: HomeLabMachine,
    remotePath: string
  ): Promise<boolean> {
    const result = await this.sshCapture(
      machine,
      `test -d ${remotePath} && echo ok`
    );
    return result.output === 'ok';
  }

  /**
   * Spawns an SSH child, forwarding its stdout/stderr to the terminal as they
   * arrive and feeding `input` (if any) to its stdin. A delayed
   * {@link CliLogger.spinner} surfaces a loading indicator whenever the remote
   * goes quiet. Resolves with the remote exit code.
   *
   * @param machine the target machine, used for the spinner label
   * @param args the ssh argument vector (host plus command or flags)
   * @param input optional text written to the remote session's stdin
   */
  private static runStreaming(
    machine: HomeLabMachine,
    args: string[],
    input?: string
  ): Promise<number> {
    const spinner = CliLogger.spinner(`Running on ${machine}...`, {
      delayMs: SSH_SPINNER_DELAY_MS
    });
    return new Promise((resolve) => {
      const child = spawn('ssh', args);
      const forward =
        (stream: NodeJS.WriteStream) =>
        (data: Buffer): void => {
          spinner.poke();
          stream.write(data);
        };
      child.stdout.on('data', forward(process.stdout));
      child.stderr.on('data', forward(process.stderr));
      child.on('error', () => {
        spinner.stop();
        resolve(1);
      });
      child.on('close', (code) => {
        spinner.stop();
        resolve(code ?? 0);
      });
      if (input !== undefined) child.stdin.write(input);
      child.stdin.end();
    });
  }
}
