import { DR, sleep } from '@aneuhold/core-ts-lib';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLIService.js';

/**
 * A service that provides functionality for interacting with the Docker
 * application.
 */
export default class DockerService {
  /**
   * Starts the Docker Desktop application. If it is already running, it doesn't
   * do anything.
   */
  static async startDockerDesktop() {
    const currentOS = CurrentEnv.os;
    const dockerPath = DockerService.getDockerPath(currentOS);
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
  static getDockerPath(os: OperatingSystemType): string | null {
    switch (os) {
      case OperatingSystemType.Windows:
        return `& "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"`;
      default:
        DR.logger.error('Docker path not defined for this OS yet.');
        return null;
    }
  }
}
