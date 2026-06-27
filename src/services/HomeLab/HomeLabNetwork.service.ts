import { DR } from '@aneuhold/core-ts-lib';
import { spawn, spawnSync } from 'child_process';
import { MACHINES } from '../../config/homelab/machines.js';
import { HomeLabMachine } from '../../config/homelab/types.js';
import { ConfigService } from '../../services/Config.service.js';
import CliLogger from '../../utils/CliLogger.js';

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
   * Milliseconds an SSH command may stay silent before a spinner appears.
   */
  static readonly #SSH_SPINNER_DELAY_MS = 500;

  /**
   * Returns the SSH connection string (user@host) for the given machine. The
   * login user is resolved from the `homelab.machineCreds` override for that
   * machine when set, otherwise the machine's built-in default.
   *
   * @param machine the target machine
   */
  static async sshHost(machine: HomeLabMachine): Promise<string> {
    const { host } = MACHINES[machine];
    return `${await this.#resolveUser(machine)}@${host}`;
  }

  /**
   * Runs a command on the given machine via SSH, streaming its output to the
   * terminal as it arrives. Resolves with the remote exit code.
   *
   * @param machine the target machine
   * @param command shell command to run on the remote machine
   */
  static async sshRun(
    machine: HomeLabMachine,
    command: string
  ): Promise<number> {
    const host = await this.sshHost(machine);
    return this.#runStreaming(machine, [host, command]);
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
  static async sshCapture(
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
    args.push(await this.sshHost(machine), command);
    const spinner = CliLogger.spinner(`Waiting on ${machine}...`, {
      delayMs: HomeLabNetworkService.#SSH_SPINNER_DELAY_MS
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
   * Runs several commands on the given machine in a single SSH session and
   * returns each command's stdout, trimmed, in order.
   *
   * @param machine the target machine
   * @param commands shell commands to run, in order, in one session
   */
  static async sshCaptureEach(
    machine: HomeLabMachine,
    commands: string[]
  ): Promise<string[]> {
    // A sentinel between commands lets one captured stream be split back into
    // per-command output.
    const separator = '::homelab-cmd-sep::';
    const script = commands
      .map((command) => `${command} 2>/dev/null; echo '${separator}'`)
      .join('\n');
    const { output } = await this.sshCapture(machine, script);
    const sections = output.split(separator);
    return commands.map((_, index) => (sections[index] ?? '').trim());
  }

  /**
   * Runs a command on the given machine via SSH with a pseudo-terminal allocated
   * (`-tt`) and the local terminal handed directly to ssh (`stdio: 'inherit'`),
   * so remote prompts like `sudo` reach the user and keystrokes flow back. Skips
   * the spinner: it owns stdout on a timer and would clobber an interactive
   * prompt. Resolves with the remote exit code.
   *
   * @param machine the target machine
   * @param command shell command to run on the remote machine
   */
  static async sshRunInteractive(
    machine: HomeLabMachine,
    command: string
  ): Promise<number> {
    const host = await this.sshHost(machine);
    return new Promise((resolve) => {
      const child = spawn('ssh', ['-tt', host, command], {
        stdio: 'inherit'
      });
      child.on('error', () => {
        resolve(1);
      });
      child.on('close', (code) => {
        resolve(code ?? 0);
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
  static async sshRunWithInput(
    machine: HomeLabMachine,
    input: string
  ): Promise<number> {
    const host = await this.sshHost(machine);
    return this.#runStreaming(machine, [host, '-T'], input);
  }

  /**
   * Writes a file on the given machine by piping content through SSH stdin.
   * Creates parent directories as needed. Returns true on success.
   *
   * @param machine the target machine
   * @param remotePath tilde-prefixed or absolute path on the remote machine
   * @param content file content to write
   */
  static async writeRemoteFile(
    machine: HomeLabMachine,
    remotePath: string,
    content: string
  ): Promise<boolean> {
    // The path is left unquoted so the remote shell expands a leading `~`, the
    // same way every other remote path in the home lab is passed (e.g. `cd
    // ~/dir`). Quoting it, single or double, would keep `~` literal and write
    // into a directory named `~`.
    const result = spawnSync(
      'ssh',
      [
        await this.sshHost(machine),
        `mkdir -p "$(dirname ${remotePath})" && cat > ${remotePath}`
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
   * Resolves the first LAN IP reported by the given machine over SSH. Returns
   * null when the machine is unreachable or reports no address.
   *
   * @param machine the machine whose primary LAN IP to discover
   */
  static async discoverLanIp(machine: HomeLabMachine): Promise<string | null> {
    const ipResult = await this.sshCapture(
      machine,
      "hostname -I | awk '{print $1}'"
    );
    if (ipResult.exitCode !== 0 || !ipResult.output) {
      return null;
    }
    return ipResult.output;
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
  static #runStreaming(
    machine: HomeLabMachine,
    args: string[],
    input?: string
  ): Promise<number> {
    const spinner = CliLogger.spinner(`Running on ${machine}...`, {
      delayMs: HomeLabNetworkService.#SSH_SPINNER_DELAY_MS
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

  /**
   * Resolves the SSH login user for a machine: the `homelab.machineCreds`
   * override for that machine when set, otherwise its static default from the
   * {@link MACHINES} registry.
   *
   * @param machine the target machine
   */
  static async #resolveUser(machine: HomeLabMachine): Promise<string> {
    const config = await ConfigService.loadConfig();
    return (
      config.homelab?.machineCreds?.[machine]?.user ?? MACHINES[machine].user
    );
  }
}
