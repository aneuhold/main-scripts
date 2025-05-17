import { DR } from '@aneuhold/core-ts-lib';
import CLIService from '../services/CLIService.js';

/**
 * Runs `git fetch -a` and then `git pull`.
 */
export default async function fpull(): Promise<void> {
  const { output: output1 } = await CLIService.execCmd(`git fetch -a`, false);

  // Even if it doesn't "complete" that is because git fetch -a seems to
  // regularly output a stderr for some reason even when it succeeds
  DR.logger.info(output1);
  const { output: output2 } = await CLIService.execCmd(`git pull`);
  DR.logger.info(output2);
  process.exit();
}
