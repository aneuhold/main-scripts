import { CurrentEnv, Logger } from '@aneuhold/core-ts-lib';
import projects, { FolderName, Project } from '../config/projects';

export default async function setup(): Promise<void> {
  const project = getProject();
  Logger.verbose.info(`Project found for setup was ${project}`);
  if (project?.setup) {
    await project.setup();
  } else {
    Logger.failure(
      `There are no settings for the folder with name ${CurrentEnv.folderName()}. Please add them to the main-scripts project.`
    );
  }
}

function getProject(): Project | undefined {
  const currentFolderName = CurrentEnv.folderName();
  return projects[currentFolderName as FolderName];
}
