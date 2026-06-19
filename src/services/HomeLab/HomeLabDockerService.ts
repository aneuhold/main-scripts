import { DR } from '@aneuhold/core-ts-lib';
import { HomeLabMachine } from '../../config/homelab/types.js';
import DockerService from '../applications/DockerService.js';
import HomeLabNetworkService from './HomeLabNetworkService.js';

/**
 * Remote Docker access for the home lab: the single layer that threads
 * {@link DockerService} command strings over {@link HomeLabNetworkService} SSH.
 * Detectors and drivers go through here instead of re-issuing the same
 * ssh + docker incantations, so `DockerService` stays a pure command builder and
 * `HomeLabNetworkService` stays pure SSH.
 */
export default class HomeLabDockerService {
  /**
   * True if the Docker daemon answers on the machine.
   *
   * @param machine the machine to check
   */
  static async isAvailable(machine: HomeLabMachine): Promise<boolean> {
    const { output } = await HomeLabNetworkService.sshCapture(
      machine,
      DockerService.getDockerInfoCheckCommand()
    );
    return output === 'ok';
  }

  /**
   * Names of containers currently running on the machine.
   *
   * @param machine the machine to query
   */
  static runningContainers(machine: HomeLabMachine): Promise<Set<string>> {
    return this.captureNames(
      machine,
      DockerService.getRunningContainersCommand()
    );
  }

  /**
   * Names of stopped (exited) containers on the machine.
   *
   * @param machine the machine to query
   */
  static exitedContainers(machine: HomeLabMachine): Promise<Set<string>> {
    return this.captureNames(
      machine,
      DockerService.getExitedContainersCommand()
    );
  }

  /**
   * Runs a Docker command on the machine, but only when the daemon is available
   * — otherwise prints a hint and skips, so a single-container op fails friendly
   * instead of surfacing a raw "docker: command not found" error.
   *
   * @param machine the machine to run on
   * @param command the docker command to run, built via {@link DockerService}
   */
  static async runIfAvailable(
    machine: HomeLabMachine,
    command: string
  ): Promise<void> {
    if (!(await this.isAvailable(machine))) {
      DR.logger.info(
        `Docker is not available on ${machine} — ` +
          'run "tb homelab deploy" to set up the Docker host first.'
      );
      return;
    }
    HomeLabNetworkService.sshRun(machine, command);
  }

  /**
   * Runs a compose command for a stack, but only when its project directory
   * exists on the machine (i.e. it has been deployed) — otherwise prints a hint
   * and skips rather than surfacing a raw `cd` error.
   *
   * @param machine the machine to run on
   * @param remoteDir the stack's remote compose directory
   * @param command the compose command to run, built via {@link DockerService}
   */
  static async runIfDeployed(
    machine: HomeLabMachine,
    remoteDir: string,
    command: string
  ): Promise<void> {
    if (!(await HomeLabNetworkService.remoteDirExists(machine, remoteDir))) {
      DR.logger.info(
        `Compose project "${remoteDir}" is not deployed on ${machine} — ` +
          'run "tb homelab deploy" first.'
      );
      return;
    }
    HomeLabNetworkService.sshRun(machine, command);
  }

  /**
   * Runs a `docker ps`-style command and parses its newline-delimited container
   * names into a set, ignoring blank lines.
   *
   * @param machine the machine to query
   * @param command the ps command to run
   */
  private static async captureNames(
    machine: HomeLabMachine,
    command: string
  ): Promise<Set<string>> {
    const { output } = await HomeLabNetworkService.sshCapture(machine, command);
    return new Set(
      output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }
}
