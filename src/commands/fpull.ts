import { CLIService } from '@aneuhold/be-ts-lib';
import { Logger } from '@jsr/aneuhold__core-ts-lib';

export default async function fpull(): Promise<void> {
  const { output: output1 } = await CLIService.execCmd(`git fetch -a`, false);

  // Even if it doesn't "complete" that is because git fetch -a seems to
  // regularly output a stderr for some reason even when it succeeds
  Logger.info(output1);
  const { output: output2 } = await CLIService.execCmd(`git pull`);
  Logger.info(output2);
  process.exit();
}
