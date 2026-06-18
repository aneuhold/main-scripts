import { DR } from '@aneuhold/core-ts-lib';
import { spawnSync } from 'child_process';
import { HomeLabMachine } from '../config/homelab/registry.js';
import CLIService from '../services/CLIService.js';
import HomeLabNetworkService from '../services/HomeLab/HomeLabNetworkService.js';

enum ConnectTarget {
  Pi1 = 'pi1',
  Pi2 = 'pi2',
  Router = 'router'
}

type TargetConfig = {
  cmd: string;
  args: string[];
};

const TARGET_CONFIGS: Record<ConnectTarget, TargetConfig> = {
  [ConnectTarget.Pi1]: {
    cmd: 'ssh',
    args: [HomeLabNetworkService.sshHost(HomeLabMachine.Pi1)]
  },
  [ConnectTarget.Pi2]: {
    cmd: 'ssh',
    args: [HomeLabNetworkService.sshHost(HomeLabMachine.Pi2)]
  },
  [ConnectTarget.Router]: {
    cmd: 'ssh',
    args: [HomeLabNetworkService.sshHost(HomeLabMachine.Router)]
  }
};

/**
 * Returns true if the given string is a valid {@link ConnectTarget}.
 *
 * @param value the string to check
 */
function isConnectTarget(value: string): value is ConnectTarget {
  const values: string[] = Object.values(ConnectTarget);
  return values.includes(value);
}

/**
 * Opens an interactive connection session to a home network target. Presents
 * a selection menu if no target is provided.
 *
 * @param target the shorthand target name
 */
export default async function connect(target?: string): Promise<void> {
  const selected =
    target ?? (await CLIService.selectFromList(Object.values(ConnectTarget)));

  if (!isConnectTarget(selected)) {
    const available = Object.values(ConnectTarget).join(', ');
    DR.logger.error(
      `Unknown target "${selected}". Available targets: ${available}`
    );
    process.exit(1);
    return;
  }

  const config = TARGET_CONFIGS[selected];
  const result = spawnSync(config.cmd, config.args, { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}
