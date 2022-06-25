import projects, { FolderName } from '../config/projects';
import applications, {
  AppName
} from '../helperFunctions/applications/applications';
import { execCmdWithTimeout } from '../helperFunctions/cmd';
import getFileNameExtension from '../helperFunctions/stringFunctions';
import CurrentEnv from '../utils/CurrentEnv';
import Log from '../utils/Log';

/**
 * Starts the process of opening a specific application.
 *
 * @param appName the name of the app to open. This doesn't have to be
 * a valid one. This function will check.
 * @param methodName the name of the method to run with that app if it exists
 */
async function openApplication(appName: string, methodName?: string) {
  const appIsSetup = Object.prototype.hasOwnProperty.call(
    applications,
    appName
  );
  if (appIsSetup) {
    // Look for a second level operation if one is specified
    if (methodName) {
      console.log('Extra methods arent setup yet');
    }
    await applications[appName as AppName].defaultCall();
  } else {
    Log.error(
      `The app with the name "${appName}" is not one of the programmed ` +
        `apps. See below for a list of programmed apps:`
    );
    Object.keys(applications).forEach((name) => {
      console.log(`- ${name}\n`);
    });
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
    Log.success(
      `Opening ${projects[currentFolderName].solutionFilePath} in Visual Studio...`
    );
    await execCmdWithTimeout(
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
    Log.failure(
      `There were more than 1 solution files that were found. The solution files that were found were: `
    );
    console.log(filesWithSlnExtension);
    return;
  }
  if (filesWithSlnExtension.length > 0) {
    Log.success(`Opening ${filesWithSlnExtension[0]} in Visual Studio...`);
    await execCmdWithTimeout(`devenv ${filesWithSlnExtension[0]}`, 4000);
    return;
  }

  // All else fails, open VS Code 😁
  Log.success(`Opening current directory in VS Code...`);
  await execCmdWithTimeout(`code .`, 4000);
}
