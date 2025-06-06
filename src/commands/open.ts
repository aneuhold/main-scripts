import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import projects, { FolderName, Project } from '../config/projects.js';
import BrowserService from '../services/applications/BrowserService.js';
import ChromeService from '../services/applications/ChromeService.js';
import GitService from '../services/applications/GitService.js';
import OSFileSystemService from '../services/applications/OSFileSystemService.js';
import CLIService from '../services/CLIService.js';
import FileSearchService from '../services/FileSearchService.js';
import CurrentEnv from '../utils/CurrentEnv.js';

/**
 * This should probably be updated for correct pathing and different OSes
 */
const PATH_TO_RUBY_GEMS = `$HOME/.asdf/installs/ruby`;

/**
 * The list of app names that are possible. These can be aliases to specific
 * operations as well. This is the single source of truth.
 */
export enum AppName {
  chrome = 'chrome',
  nugetCache = 'nugetCache',
  rubyGems = 'rubyGems',
  repo = 'repo', // Added
  r = 'r' // Added alias for repo
}

/**
 * Starts the process of opening a specific application.
 *
 * @param appName the name of the app to open. This doesn't have to be
 * a valid one. This function will check.
 * @param methodName the name of the method to run with that app if it exists
 */
async function openApplication(appName: string, methodName?: string) {
  const appIsSetup = Object.prototype.hasOwnProperty.call(AppName, appName);
  if (appIsSetup) {
    // Look for a second level operation if one is specified
    if (methodName) {
      console.log('Extra methods arent setup yet');
    }
    await runApplication(appName as AppName);
  } else {
    DR.logger.error(
      `The app with the name "${appName}" is not one of the programmed ` +
        `apps. See below for a list of programmed apps:`
    );
    Object.keys(AppName).forEach((name) => {
      console.log(`- ${name}\n`);
    });
  }
}

/**
 * Runs the specified application.
 *
 * @param appName The name of the application to run.
 */
async function runApplication(appName: AppName) {
  switch (appName) {
    case AppName.chrome:
      await ChromeService.openAndSetPinnedTabs();
      break;
    case AppName.nugetCache:
      await OSFileSystemService.openNugetCache();
      break;
    case AppName.rubyGems:
      await CLIService.execCmd(`open ${PATH_TO_RUBY_GEMS}`);
      break;
    case AppName.r: // Alias for repo
    case AppName.repo:
      await openRepositoryPage();
      break;
    default:
      break;
  }
}

/**
 * Opens the specified solution file using the system's default program.
 *
 * @param solutionFilePath The absolute or relative path to the .sln file.
 */
async function openSolutionFile(solutionFilePath: string) {
  const solutionFileCommand = await CurrentEnv.getSolutionFileCommand();
  const fullCommand = `${solutionFileCommand}"${solutionFilePath}"`;
  DR.logger.success(`Opening ${solutionFilePath} with "${fullCommand}"`);
  await CLIService.execCmdWithTimeout(fullCommand, 4000);
}

/**
 * Opens the current repository's page in the default browser.
 */
async function openRepositoryPage(): Promise<void> {
  const repoUrl = await GitService.getCurrentGitRepositoryUrl();
  if (repoUrl) {
    await BrowserService.openUrl(repoUrl);
  } else {
    DR.logger.error(
      'Repository URL could not be determined. Cannot open in browser.'
    );
  }
}

/**
 *
 */
async function openVSCode() {
  DR.logger.success(`Opening current directory in VS Code...`);
  await CLIService.execCmdWithTimeout(`code .`, 4000);
}

/**
 *
 */
async function findAndOpenProject(): Promise<void> {
  const currentDir = process.cwd();

  // Check for package.json in current directory
  const hasPackageJson = await FileSearchService.fileExistsInDir(
    currentDir,
    'package.json'
  );

  // Search for solution files
  const solutionFiles = await FileSearchService.findFilesWithExtension(
    currentDir,
    'sln'
  );

  // If only package.json exists, open VS Code
  if (hasPackageJson && solutionFiles.length === 0) {
    await openVSCode();
    return;
  }

  // If only solution files exist (no package.json)
  if (!hasPackageJson) {
    if (solutionFiles.length === 1) {
      await openSolutionFile(solutionFiles[0]);
      return;
    }

    if (solutionFiles.length === 0) {
      await openVSCode();
      return;
    }

    // Multiple solution files exist
    const relativePaths = solutionFiles.map((file) =>
      path.relative(currentDir, file)
    );
    const selectedRelativePath = await CLIService.selectFromList(relativePaths);
    await openSolutionFile(selectedRelativePath);
    return;
  }

  // Both package.json and solution files exist - present options
  const options: string[] = [];
  const optionMap: Map<string, () => Promise<void>> = new Map();

  // Add VS Code option at the top
  const vsCodeOption = 'Root with VS Code';
  options.push(vsCodeOption);
  optionMap.set(vsCodeOption, () => openVSCode());

  // Add solution files from current directory
  solutionFiles.forEach((file) => {
    const relativePath = path.relative(currentDir, file);
    options.push(relativePath);
    optionMap.set(relativePath, () => openSolutionFile(file));
  });

  const selectedOption = await CLIService.selectFromList(options);
  const action = optionMap.get(selectedOption);
  if (action) {
    await action();
  }
}

/**
 * Opens a project or application.
 *
 * @param appName The name of the app or project to open.
 * @param methodName The name of the method to run with that app if it exists.
 */
export default async function open(
  appName?: string,
  methodName?: string
): Promise<void> {
  if (appName) {
    await openApplication(appName, methodName);
    return;
  }

  const currentFolderName = CurrentEnv.folderName();

  let project: Project | undefined;
  if (currentFolderName in projects) {
    project = projects[currentFolderName as FolderName];
  }

  // If there is already a solution file that should be chosen
  if (project?.solutionFilePath) {
    await openSolutionFile(project.solutionFilePath);
    return;
  }

  await findAndOpenProject();
}
