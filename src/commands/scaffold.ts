import path from 'path';
import fs from 'fs';
import Log from '../helperFunctions/Log';
import getUserInput from '../helperFunctions/input';
import templates, { ProjectType } from '../templates/Templates';

/**
 * The path to the templates folder relative to this file.
 */
const pathToTemplates = path.join(
  __dirname,
  '..',
  'templates',
  'template-folders'
);

function createDirectoryContents(templatePath: string, newProjectPath: string) {
  const filesToCreate = fs.readdirSync(templatePath);

  filesToCreate.forEach((file) => {
    const origFilePath = path.join(templatePath, file);

    // get stats about the current file
    const stats = fs.statSync(origFilePath);

    if (stats.isFile()) {
      const contents = fs.readFileSync(origFilePath, 'utf8');

      const writePath = path.join(newProjectPath, file);
      fs.writeFileSync(writePath, contents, 'utf8');
    } else if (stats.isDirectory()) {
      fs.mkdirSync(path.join(newProjectPath, file));

      // recursive call
      createDirectoryContents(
        path.join(templatePath, file),
        path.join(newProjectPath, file)
      );
    }
  });
}

/**
 * Copies the template at the given path to a new folder with the given project
 * name.
 *
 * @param pathToTemplate
 * @param projectName
 */
function copyTemplateToSubDir(pathToTemplate: string, projectName: string) {
  const newProjectPath = path.join(process.cwd(), projectName);
  fs.mkdirSync(newProjectPath);
  Log.info(`Copying template to ${newProjectPath}`);
  createDirectoryContents(pathToTemplate, newProjectPath);
}

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
    console.table(templates, ['name', 'description']);
    process.exit();
  }
  if (!templates[projectType as ProjectType]) {
    Log.error(
      `No project type found with name: ${projectType}. Please ` +
        `either add one to the "templates" folder or use one of the ones below:`
    );
    console.table(templates, ['name', 'description']);
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

  const template = templates[projectType as ProjectType];
  // Get the path to the template folder

  const pathToTemplate = path.join(pathToTemplates, template.folderName);

  Log.verbose.info(`The path to the template is ${pathToTemplate}`);

  copyTemplateToSubDir(pathToTemplate, chosenProjectName);

  Log.success(`Successfully created new project ${chosenProjectName}`);
  Log.info(`Use "cd ${chosenProjectName}" to move into that directory`);
  process.exit();
}

/*

*/
