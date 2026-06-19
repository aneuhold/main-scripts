import { DR, sleep } from '@aneuhold/core-ts-lib';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLIService.js';

/**
 * A service that provides functionality for interacting with the Docker
 * application, including builders for Docker CLI command strings (run locally
 * or piped to a remote host over SSH). The shell-sensitive `--format` strings
 * are preserved verbatim — do not reflow.
 */
export default class DockerService {
  /**
   * Starts the Docker Desktop application. If it is already running, it doesn't
   * do anything.
   */
  static async startDockerDesktop() {
    const currentOS = CurrentEnv.os;
    const dockerPath = DockerService.getDockerDesktopPath(currentOS);
    let dockerRunning = await DockerService.checkIfDockerDesktopIsRunning();
    if (!dockerRunning && dockerPath) {
      DR.logger.info('Docker desktop is not running. Starting it now...');
      await CLIService.execCmdWithTimeout(dockerPath, 4000);
      while (!dockerRunning) {
        DR.logger.info('Waiting for Docker to start...');
        await sleep(2000);
        dockerRunning = await DockerService.checkIfDockerDesktopIsRunning();
      }
    }
    DR.logger.info('Docker desktop is running.');
  }

  /**
   * Checks if Docker Desktop is currently running.
   */
  static async checkIfDockerDesktopIsRunning(): Promise<boolean> {
    const currentOS = CurrentEnv.os;
    if (currentOS === OperatingSystemType.Windows) {
      const { didComplete } = await CLIService.execCmd('Get-Process docker');
      if (didComplete) {
        DR.logger.verbose.info('Docker is running.');
        return true;
      }
      DR.logger.verbose.info('Docker is not running.');
      return false;
    }
    DR.logger.error('Docker command not defined for this OS yet.');
    return false;
  }

  /**
   * Gets the path to the docker application for the current system given the
   * operating system type.
   *
   * This does include the quotes
   *
   * @param os The operating system type.
   */
  static getDockerDesktopPath(os: OperatingSystemType): string | null {
    switch (os) {
      case OperatingSystemType.Windows:
        return `& "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"`;
      default:
        DR.logger.error('Docker path not defined for this OS yet.');
        return null;
    }
  }

  /**
   * Builds the `docker compose up -d` command for the given directory.
   *
   * @param dir directory holding the compose file
   */
  static getComposeUpCommand(dir: string): string {
    return `cd ${dir} && docker compose up -d`;
  }

  /**
   * Builds the `docker compose stop` command for the given directory.
   *
   * @param dir directory holding the compose file
   */
  static getComposeStopCommand(dir: string): string {
    return `cd ${dir} && docker compose stop`;
  }

  /**
   * Builds the `docker compose restart` command for the given directory.
   *
   * @param dir directory holding the compose file
   */
  static getComposeRestartCommand(dir: string): string {
    return `cd ${dir} && docker compose restart`;
  }

  /**
   * Builds the `docker compose ps` command for the given directory.
   *
   * @param dir directory holding the compose file
   */
  static getComposePsCommand(dir: string): string {
    return `cd ${dir} && docker compose ps`;
  }

  /**
   * Builds the `docker compose logs -f` command for the given directory,
   * optionally filtered to a single service.
   *
   * @param dir directory holding the compose file
   * @param service optional service/container name to filter
   */
  static getComposeLogsCommand(dir: string, service?: string): string {
    const serviceArg = service ? ` ${service}` : '';
    return `cd ${dir} && docker compose logs -f${serviceArg}`;
  }

  /**
   * Builds the `docker compose down` command for the given directory,
   * optionally removing named volumes.
   *
   * @param dir directory holding the compose file
   * @param removeVolumes if true, passes -v
   */
  static getComposeDownCommand(dir: string, removeVolumes: boolean): string {
    const flag = removeVolumes ? ' -v' : '';
    return `cd ${dir} && docker compose down${flag}`;
  }

  /**
   * Builds the `docker start <name>` command.
   *
   * @param name container name
   */
  static getContainerStartCommand(name: string): string {
    return `docker start ${name}`;
  }

  /**
   * Builds the `docker stop <name>` command.
   *
   * @param name container name
   */
  static getContainerStopCommand(name: string): string {
    return `docker stop ${name}`;
  }

  /**
   * Builds the `docker restart <name>` command.
   *
   * @param name container name
   */
  static getContainerRestartCommand(name: string): string {
    return `docker restart ${name}`;
  }

  /**
   * Builds the command that prints the run-state of a single container.
   *
   * @param name container name
   */
  static getContainerStatusCommand(name: string): string {
    return `docker inspect --format='{{.State.Status}}' ${name}`;
  }

  /**
   * Builds the `docker logs -f <name>` command.
   *
   * @param name container name
   */
  static getContainerLogsCommand(name: string): string {
    return `docker logs -f ${name}`;
  }

  /**
   * Builds the command that lists the names of currently running containers,
   * one per line.
   */
  static getRunningContainersCommand(): string {
    return "docker ps --format '{{.Names}}'";
  }

  /**
   * Builds the command that lists the names of stopped (exited) containers,
   * one per line.
   */
  static getExitedContainersCommand(): string {
    return "docker ps -a --filter status=exited --format '{{.Names}}'";
  }

  /**
   * Builds a command that prints `ok` if the Docker daemon is up, `no_docker`
   * otherwise.
   */
  static getDockerInfoCheckCommand(): string {
    return 'docker info > /dev/null 2>&1 && echo ok || echo no_docker';
  }
}
