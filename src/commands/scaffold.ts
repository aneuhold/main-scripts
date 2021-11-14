import Log from '../helperFunctions/Log';
import getUserInput from '../helperFunctions/input';

export default async function scaffold(args: string[]): Promise<void> {
  Log.info(`Args provided were: ${args}`);
  console.log(await getUserInput('What is the name of the project?'));
}
