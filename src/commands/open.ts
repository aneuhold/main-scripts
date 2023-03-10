import {
  ChromeService,
  CLIService,
  CurrentEnv,
  FileSystemService,
  getFileNameExtension,
  Logger
} from '@aneuhold/core-ts-lib';
import projects, { FolderName } from '../config/projects';

/**
 * The list of app names that are possible. These can be aliases to specific
 * operations as well. This is the single source of truth.
 */
export enum AppName {
  chrome = 'chrome',
  nugetCache = 'nugetCache'
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
    Logger.error(
      `The app with the name "${appName}" is not one of the programmed ` +
        `apps. See below for a list of programmed apps:`
    );
    Object.keys(AppName).forEach((name) => {
      console.log(`- ${name}\n`);
    });
  }
}

async function runApplication(appName: AppName) {
  switch (appName) {
    case AppName.chrome:
      await ChromeService.openAndSetPinnedTabs();
      break;
    case AppName.nugetCache:
      await FileSystemService.openNugetCache();
      break;
    default:
      break;
  }
}

/**
 * The main entry-point for the `open` command.
 */
export default async function open(
  appName?: string,
  methodName?: string
): Promise<void> {
  if (appName) {
    await openApplication(appName, methodName);
    return;
  }

  const currentFolderName = CurrentEnv.folderName() as FolderName;

  // If there is already a solution file that should be chosen
  if (projects[currentFolderName]?.solutionFilePath) {
    Logger.success(
      `Opening ${projects[currentFolderName].solutionFilePath} in Visual Studio...`
    );
    await CLIService.execCmdWithTimeout(
      `devenv "${projects[currentFolderName].solutionFilePath}"`,
      4000
    );
    return;
  }

  const fileNamesInDir = await CurrentEnv.fileNamesInDir();
  const filesWithSlnExtension = fileNamesInDir.filter(
    (fileName) => getFileNameExtension(fileName) === 'sln'
  );

  if (filesWithSlnExtension.length > 1) {
    Logger.failure(
      `There were more than 1 solution files that were found. The solution files that were found were: `
    );
    console.log(filesWithSlnExtension);
    return;
  }
  if (filesWithSlnExtension.length > 0) {
    Logger.success(`Opening ${filesWithSlnExtension[0]} in Visual Studio...`);
    await CLIService.execCmdWithTimeout(
      `devenv ${filesWithSlnExtension[0]}`,
      4000
    );
    return;
  }

  // All else fails, open VS Code 😁
  Logger.success(`Opening current directory in VS Code...`);
  await CLIService.execCmdWithTimeout(`code .`, 4000);
}
