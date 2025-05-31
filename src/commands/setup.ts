import { DR } from '@aneuhold/core-ts-lib';
import projects, { FolderName, Project } from '../config/projects.js';
import CurrentEnv from '../utils/CurrentEnv.js';

/**
 * Sets up the development environment based on the current project.
 */
export default async function setup(): Promise<void> {
  const project = getProject();
  DR.logger.verbose.info(
    `Project found for setup was ${JSON.stringify(project)}`
  );
  if (project?.setup) {
    await project.setup();
  } else {
    DR.logger.error(
      `There are no settings for the folder with name ${CurrentEnv.folderName()}. Please add them to the main-scripts project.`
    );
  }
}

/**
 * Gets the project configuration for the current folder.
 */
function getProject(): Project | undefined {
  const currentFolderName = CurrentEnv.folderName();
  return projects[currentFolderName as FolderName];
}
