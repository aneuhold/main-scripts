import { MainScriptsConfig } from '../ConfigService.js';
import {
  APPLICATION_MACHINE_MAP,
  HomeLabApplicationInfo
} from '../../config/homelab/homeLabNetworkMap.js';
import HomeLabNetworkService from './HomeLabNetworkService.js';

/**
 * Per-application operations for the home lab. Uses ops-first dispatch — if an
 * application defines a custom op, it is called instead of the default
 * implementation. Defaults use the container name as the Docker target and look
 * up the machine via {@link APPLICATION_MACHINE_MAP}.
 */
export default class HomeLabApplicationService {
  /**
   * Deploys the application. Only works for apps that define a custom deploy op.
   *
   * @param info the application entry
   * @param config user config passed to the deploy op
   */
  static deploy(info: HomeLabApplicationInfo, config: MainScriptsConfig): void {
    if (info.ops?.deploy) {
      info.ops.deploy(config);
      return;
    }
    throw new Error(`No deploy operation defined for ${info.id}`);
  }

  /**
   * Starts the application's container.
   *
   * @param info the application entry
   */
  static start(info: HomeLabApplicationInfo): void {
    if (info.ops?.start) {
      info.ops.start();
      return;
    }
    const machine = this.getMachine(info);
    HomeLabNetworkService.sshRun(machine, `docker start ${info.id}`);
  }

  /**
   * Stops the application's container.
   *
   * @param info the application entry
   */
  static stop(info: HomeLabApplicationInfo): void {
    if (info.ops?.stop) {
      info.ops.stop();
      return;
    }
    const machine = this.getMachine(info);
    HomeLabNetworkService.sshRun(machine, `docker stop ${info.id}`);
  }

  /**
   * Restarts the application's container.
   *
   * @param info the application entry
   */
  static restart(info: HomeLabApplicationInfo): void {
    if (info.ops?.restart) {
      info.ops.restart();
      return;
    }
    const machine = this.getMachine(info);
    HomeLabNetworkService.sshRun(machine, `docker restart ${info.id}`);
  }

  /**
   * Shows the current status of the application's container.
   *
   * @param info the application entry
   */
  static status(info: HomeLabApplicationInfo): void {
    if (info.ops?.status) {
      info.ops.status();
      return;
    }
    const machine = this.getMachine(info);
    HomeLabNetworkService.sshRun(
      machine,
      `docker inspect --format='{{.State.Status}}' ${info.id}`
    );
  }

  /**
   * Streams logs from the application's container.
   *
   * @param info the application entry
   */
  static logs(info: HomeLabApplicationInfo): void {
    if (info.ops?.logs) {
      info.ops.logs();
      return;
    }
    const machine = this.getMachine(info);
    HomeLabNetworkService.sshRun(machine, `docker logs -f ${info.id}`);
  }

  /**
   * Returns the machine for the given application, or throws if not assigned.
   *
   * @param info the application entry
   */
  private static getMachine(info: HomeLabApplicationInfo) {
    const machine = APPLICATION_MACHINE_MAP[info.id];
    if (!machine) {
      throw new Error(`${info.id} is not assigned to any machine`);
    }
    return machine;
  }
}
