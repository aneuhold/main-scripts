import execCmd from '../helperFunctions/cmd';
import Log from '../helperFunctions/logger';

export default async function fpull(): Promise<void> {
  const { didComplete, output: output1 } = await execCmd(`git fetch -a`);
  if (didComplete) {
    Log.info(output1);
    const { output: output2 } = await execCmd(`git pull`);
    Log.info(output2);
  }
}
