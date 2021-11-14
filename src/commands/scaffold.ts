import Log from '../helperFunctions/Log';
import getUserInput from '../helperFunctions/input';

export default async function scaffold(
  projectType?: string,
  projectName?: string
): Promise<void> {
  if (!projectType) {
    Log.error('No project type was given. See below for possible options:');
  }
  Log.info(`The desired project type is: ${projectType}`);
  Log.info(`The desired project name is: ${projectName}`);

  console.log(await getUserInput('What is the name of the project?'));
}
