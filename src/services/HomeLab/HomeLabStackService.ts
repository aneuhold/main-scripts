import { MainScriptsConfig } from '../ConfigService.js';
import { HomeLabStack } from '../../config/homelab/homeLabNetworkMap.js';
import HomeLabNetworkService from './HomeLabNetworkService.js';

/**
 * Stack-level operations for the home lab. Uses ops-first dispatch — if a
 * stack defines a custom op, it is called instead of the default implementation.
 */
export default class HomeLabStackService {
  /**
   * Deploys the stack: writes config files and starts all containers. If the
   * stack defines a custom deploy op, it is called instead.
   *
   * @param stack the target stack
   * @param config user config (passwords, etc.)
   */
  static deploy(stack: HomeLabStack, config: MainScriptsConfig): void {
    if (stack.ops?.deploy) {
      stack.ops.deploy(config);
      return;
    }
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose up -d`
    );
  }

  /**
   * Starts all containers in the stack.
   *
   * @param stack the target stack
   */
  static start(stack: HomeLabStack): void {
    if (stack.ops?.start) {
      stack.ops.start();
      return;
    }
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose up -d`
    );
  }

  /**
   * Stops all containers in the stack.
   *
   * @param stack the target stack
   */
  static stop(stack: HomeLabStack): void {
    if (stack.ops?.stop) {
      stack.ops.stop();
      return;
    }
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose stop`
    );
  }

  /**
   * Restarts all containers in the stack.
   *
   * @param stack the target stack
   */
  static restart(stack: HomeLabStack): void {
    if (stack.ops?.restart) {
      stack.ops.restart();
      return;
    }
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose restart`
    );
  }

  /**
   * Shows the current status of all containers in the stack.
   *
   * @param stack the target stack
   */
  static status(stack: HomeLabStack): void {
    if (stack.ops?.status) {
      stack.ops.status();
      return;
    }
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose ps`
    );
  }

  /**
   * Streams logs from the stack, optionally filtered to one service.
   *
   * @param stack the target stack
   * @param service optional container name to filter; all services if omitted
   */
  static logs(stack: HomeLabStack, service?: string): void {
    if (stack.ops?.logs) {
      stack.ops.logs(service);
      return;
    }
    const serviceArg = service ? ` ${service}` : '';
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose logs -f${serviceArg}`
    );
  }

  /**
   * Tears down the stack by stopping and removing its containers, optionally
   * also deleting named volumes.
   *
   * @param stack the target stack
   * @param removeVolumes if true, passes -v to docker compose down
   */
  static teardown(stack: HomeLabStack, removeVolumes: boolean): void {
    if (stack.ops?.teardown) {
      stack.ops.teardown(removeVolumes);
      return;
    }
    const flag = removeVolumes ? ' -v' : '';
    HomeLabNetworkService.sshRun(
      stack.machine,
      `cd ${stack.remoteDir} && docker compose down${flag}`
    );
  }
}
