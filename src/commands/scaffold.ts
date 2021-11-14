import Log from '../helperFunctions/Log';

export default async function scaffold(args: string[]): Promise<void> {
  Log.info(`Args provided were: ${args}`);
}
