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

const TARGET_MACHINES: Record<ConnectTarget, HomeLabMachine> = {
  [ConnectTarget.Pi1]: HomeLabMachine.Pi1,
  [ConnectTarget.Pi2]: HomeLabMachine.Pi2,
  [ConnectTarget.Router]: HomeLabMachine.Router
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
    target ??
    (await CLIService.selectFromList(
      Object.values(ConnectTarget),
      'Select a target to connect to'
    ));

  if (!isConnectTarget(selected)) {
    const available = Object.values(ConnectTarget).join(', ');
    DR.logger.error(
      `Unknown target "${selected}". Available targets: ${available}`
    );
    process.exit(1);
    return;
  }

  const host = await HomeLabNetworkService.sshHost(TARGET_MACHINES[selected]);
  const result = spawnSync('ssh', [host], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}
