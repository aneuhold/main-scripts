import { DR } from '@aneuhold/core-ts-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import CLIService from '../services/CLIService.js';
import templates, { ProjectType } from '../templates/Templates.js';

// Convert import.meta.url to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The path to the templates folder relative to this file.
 */
const pathToTemplates = path.join(
  __dirname,
  '..',
  'templates',
  'template-folders'
);

/**
 * Creates the directory contents for a new project from a template.
 *
 * @param templatePath The path to the template.
 * @param newProjectPath The path to the new project.
 */
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
 * @param pathToTemplate The path to the template folder.
 * @param projectName The name of the new project.
 */
function copyTemplateToSubDir(pathToTemplate: string, projectName: string) {
  const newProjectPath = path.join(process.cwd(), projectName);
  fs.mkdirSync(newProjectPath);
  DR.logger.info(`Copying template to ${newProjectPath}`);
  createDirectoryContents(pathToTemplate, newProjectPath);
}

/**
 * Scaffolds a new project based on a project type and project name.
 *
 * @param projectType The type of project to scaffold.
 * @param projectName The name of the new project.
 * @param shouldListProjectTypes Whether to list available project types.
 */
export default async function scaffold(
  projectType?: string,
  projectName?: string,
  shouldListProjectTypes?: boolean
): Promise<void> {
  if (shouldListProjectTypes) {
    DR.logger.info('The possible project types are: ');
    console.table(templates, ['name', 'description']);
    process.exit();
  }
  if (!projectType) {
    DR.logger.error(
      'No project type was given. See below for possible options:'
    );
    console.table(templates, ['name', 'description']);
    process.exit();
  }
  if (!(projectType in templates)) {
    DR.logger.error(
      `No project type found with name: ${projectType}. Please ` +
        `either add one to the "templates" folder or use one of the ones below:`
    );
    console.table(templates, ['name', 'description']);
    process.exit();
  }
  DR.logger.info(`The desired project type is: ${projectType}`);

  let chosenProjectName: string;
  if (!projectName) {
    chosenProjectName = await CLIService.getUserInput(
      'What is the name of the project? This will be the name' +
        ' of the root directory of the project as well so leave spaces out: '
    );
  } else {
    chosenProjectName = projectName;
  }
  DR.logger.info(`The desired project name is: ${chosenProjectName}`);

  const template = templates[projectType as ProjectType];
  // Get the path to the template folder

  const pathToTemplate = path.join(pathToTemplates, template.folderName);

  DR.logger.verbose.info(`The path to the template is ${pathToTemplate}`);

  copyTemplateToSubDir(pathToTemplate, chosenProjectName);

  DR.logger.success(`Successfully created new project ${chosenProjectName}`);
  DR.logger.info(`Use "cd ${chosenProjectName}" to move into that directory`);
  process.exit();
}
