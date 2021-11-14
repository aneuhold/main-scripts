import execCmd from '../helperFunctions/cmd';
import Log from '../helperFunctions/Log';

export default async function fpull(): Promise<void> {
  const { output: output1 } = await execCmd(`git fetch -a`, false);

  // Even if it doesn't "complete" that is because git fetch -a seems to
  // regularly output a stderr for some reason even when it succeeds
  Log.info(output1);
  const { output: output2 } = await execCmd(`git pull`);
  Log.info(output2);
}
