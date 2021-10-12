import CurrentEnv from '../helperFunctions/CurrentEnv';
import Log from '../helperFunctions/logger';

export default async function setup(): Promise<void> {
  const project = CurrentEnv.project();
  if (project?.setup) {
    await project.setup();
  } else {
    Log.failure(
      `There are no settings for the folder with name ${CurrentEnv.folderName()}. Please add them to the main-scripts project.`
    );
  }
}
