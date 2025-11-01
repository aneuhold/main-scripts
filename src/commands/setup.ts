import { DR } from '@aneuhold/core-ts-lib';
import { ProjectConfigService } from '../services/ProjectConfigService.js';
import CurrentEnv from '../utils/CurrentEnv.js';

/**
 * Sets up the development environment based on the current project.
 */
export default async function setup(): Promise<void> {
  const project = await ProjectConfigService.getCurrentProject();
  DR.logger.verbose.info(
    `Project found for setup was ${JSON.stringify(project)}`
  );
  if (project?.setup) {
    await project.setup();
  } else {
    const currentFolderName = CurrentEnv.folderName();
    DR.logger.error(
      `There are no settings for the folder with name ${currentFolderName}. Please add them to the main-scripts project.`
    );
  }
}
