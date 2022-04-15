import path from 'path';
import execCmd from './helperFunctions/cmd';
import CurrentEnv, { TerminalType } from './utils/CurrentEnv';
import Log from './utils/Log';

/**
 * Represents a project, which is typically a repo but is defined primarily
 * by the name of the folder in which it is contained.
 */
export type Project = {
  folderName: string;
  solutionFilePath?: string;
  setup?: () => Promise<void>;
  refresh?: () => Promise<void>;
};

export enum FolderName {
  piSpa = 'pi-spa',
  piDiagnoseApiService = 'pi-diagnoseapiservice',
  piCommonApiService = 'pi-commonapiservice',
  piDiagnoseSurveyInsights = 'pi-diagnosesurveyinsights',
}

/**
 * Contains the different projects that have settings based on the folder name.
 *
 * The folder name is repeated in the key and the data structure for easier
 * access.
 */
const projects: { [folderName in FolderName]: Project } = {
  'pi-spa': {
    folderName: FolderName.piSpa,
    setup: async () => {
      const project = projects['pi-spa'];
      Log.info(`Setting up ${project.folderName}...`);
      const currentPath = path.resolve('.');

      if (CurrentEnv.terminal() !== TerminalType.WindowsTerminal) {
        Log.failure(
          `Setup for pi-spa not established for anything but Windows Terminal`
        );
        return;
      }

      // Install pacakges
      Log.info('Installing yarn packages...');
      const { output: yarnInstallOutput } = await execCmd('yarn yarn:all');
      console.log(yarnInstallOutput);

      // See this post for info on how to order these commands:
      // https://superuser.com/questions/1564090/how-to-pass-commands-into-the-shell-opened-in-new-windows-terminal
      // The order of the commands matters when executing windows terminal.
      // It might be nice to setup a class that does this for you.

      // If the commands are opening in a separte window, that is probably because
      // the current window is not `0` for some reason. Although it should be.

      // Setup second terminal for client
      await execCmd(
        `Start-Process wt -ArgumentList "--window", "0", "split-pane", "--horizontal", "-d", '"${currentPath}"', "pwsh.exe", "-NoExit", "-Command", "& {yarn client}"`
      );

      // Setup third terminal for server
      await execCmd(
        `Start-Process wt -ArgumentList "--window", "0", "split-pane", "--horizontal", "-d", '"${currentPath}"', "pwsh.exe", "-NoExit", "-Command", "& {yarn server}"`
      );
    },
  },
  'pi-diagnoseapiservice': {
    folderName: FolderName.piSpa,
    solutionFilePath: 'PI.DiagnoseApiService.sln',
    refresh: async () => {
      // Delete the global nuget package for pi-corelib
      // Checkout the main branch of DiagnoseApiService
      //
      // Run refresh for pi-corelib
      // -- Pulls in main branch
      // -- Cleans pi-corelib
      // -- Builds pi-corelib
      //
      // Run a clean in the pi-diagnoseapiservice folder
      // Build pi-diagnoseapiservice
      //
    },
  },
  'pi-commonapiservice': {
    folderName: FolderName.piCommonApiService,
    solutionFilePath: path.join(
      'PI.Core.CommonAPIService',
      'PI.Core.CommonAPIService.sln'
    ),
  },
  'pi-diagnosesurveyinsights': {
    folderName: FolderName.piDiagnoseSurveyInsights,
    solutionFilePath: path.join(
      'PI.DiagnoseSurveyInsights',
      'PI.DiagnoseSurveyInsights.sln'
    ),
  },
};

export default projects;
