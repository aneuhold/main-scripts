import CurrentEnv from '../utils/CurrentEnv';
import Log from '../utils/Log';

export default async function setup(): Promise<void> {
  const project = CurrentEnv.project();
  Log.verbose.info(`Project found for setup was ${project}`);
  if (project?.setup) {
    await project.setup();
  } else {
    Log.failure(
      `There are no settings for the folder with name ${CurrentEnv.folderName()}. Please add them to the main-scripts project.`
    );
  }
}
