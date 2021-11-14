import Log from '../helperFunctions/Log';
import getUserInput from '../helperFunctions/input';
import templates, { ProjectType } from '../templates/Templates';

/**
 * Scaffolds out a project given the project type and project name as a sub
 * folder in the current working directory.
 *
 * @param projectType
 * @param projectName
 */
export default async function scaffold(
  projectType?: string,
  projectName?: string
): Promise<void> {
  if (!projectType) {
    Log.error('No project type was given. See below for possible options:');
    console.table(templates);
    process.exit();
  }
  if (!templates[projectType as ProjectType]) {
    Log.error(
      `No project type found with name: ${projectType}. Please ` +
        `either add one to the "templates" folder or use one of the ones below:`
    );
    console.table(templates);
    process.exit();
  }
  Log.info(`The desired project type is: ${projectType}`);

  let chosenProjectName: string;
  if (!projectName) {
    chosenProjectName = await getUserInput(
      'What is the name of the project? This will be the name' +
        ' of the root directory of the project as well so leave spaces out: '
    );
  } else {
    chosenProjectName = projectName;
  }
  Log.info(`The desired project name is: ${chosenProjectName}`);
  process.exit();
}
