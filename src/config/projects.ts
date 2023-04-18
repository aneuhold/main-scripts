import {
  CLIService,
  CurrentEnv,
  Logger,
  TerminalType
} from '@aneuhold/core-ts-lib';
import path from 'path';

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
  piBehavioralAssessmentApiService = 'pi-behavioralassessmentapiservice',
  piDiagnosePulseReportsFunction = 'pi-diagnose-pulsereportsfunction',
  piClientHire = 'pi-client-hire',
  piClientDesign = 'pi-client-design',
  piPermissionsLib = 'pi-permissions-lib',
  piClientDiagnose = 'pi-client-diagnose',
  piPlatform = 'pi-platform',
  clientCore = 'client-core',
  piClientOrgManagement = 'pi-client-org-management'
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
    setup: setupPiSubTerminalsFunc(FolderName.piSpa, [
      'yarn client',
      'yarn server'
    ])
  },
  'pi-diagnoseapiservice': {
    folderName: FolderName.piSpa,
    solutionFilePath: 'PI.DiagnoseApiService.sln'
  },
  'pi-commonapiservice': {
    folderName: FolderName.piCommonApiService,
    solutionFilePath: path.join(
      'PI.Core.CommonAPIService',
      'PI.Core.CommonAPIService.sln'
    )
  },
  'pi-diagnosesurveyinsights': {
    folderName: FolderName.piDiagnoseSurveyInsights,
    solutionFilePath: path.join(
      'PI.DiagnoseSurveyInsights',
      'PI.DiagnoseSurveyInsights.sln'
    )
  },
  'pi-behavioralassessmentapiservice': {
    folderName: FolderName.piDiagnoseSurveyInsights,
    solutionFilePath: 'PI.BehavioralAssessmentAPIService.sln'
  },
  'pi-diagnose-pulsereportsfunction': {
    folderName: FolderName.piDiagnosePulseReportsFunction,
    solutionFilePath: path.join(
      'PI.Diagnose.PulseReportsFunction',
      'PI.Diagnose.PulseReportsFunction.sln'
    )
  },
  'pi-client-hire': {
    folderName: FolderName.piClientHire,
    setup: setupPiSubTerminalsFunc(
      FolderName.piClientHire,
      ['yarn client', 'yarn server'],
      'hire'
    )
  },
  'pi-client-design': {
    folderName: FolderName.piClientDesign,
    setup: setupPiSubTerminalsFunc(
      FolderName.piClientDesign,
      ['yarn client', 'yarn server'],
      'design'
    )
  },
  'pi-permissions-lib': {
    folderName: FolderName.piPermissionsLib,
    solutionFilePath: 'PI.PermissionsLib.sln'
  },
  'pi-client-diagnose': {
    folderName: FolderName.piClientDiagnose,
    setup: setupPiSubTerminalsFunc(FolderName.piClientDiagnose, [
      'yarn client',
      'yarn server'
    ])
  },
  'pi-platform': {
    folderName: FolderName.piPlatform,
    setup: setupPiSubTerminalsFunc(FolderName.piPlatform, [
      'yarn client',
      'yarn server'
    ])
  },
  'client-core': {
    folderName: FolderName.clientCore,
    setup: setupPiSubTerminalsFunc(
      FolderName.clientCore,
      ['yarn watch', 'yarn unlink:local'],
      '',
      'yarn'
    )
  },
  'pi-client-org-management': {
    folderName: FolderName.piClientOrgManagement,
    setup: setupPiSubTerminalsFunc(
      FolderName.piClientOrgManagement,
      ['yarn start'],
      '',
      'yarn'
    )
  }
};

/**
 * Sets up a standardized set of terminals for PI related apps.
 *
 * @param folderName the name of the folder this starts in
 * @param separateTerminalCommands the array of different commands that should be
 * ran in their own terminal
 * @param subPath the sub-path of the main folder that the commands should
 * be ran in
 */
function setupPiSubTerminalsFunc(
  folderName: FolderName,
  separateTerminalCommands: string[],
  subPath = '',
  installCommand = 'yarn yarn:all'
) {
  return async () => {
    const project = projects[folderName];
    Logger.info(`Setting up ${project.folderName}...`);
    const currentPath = path.resolve('.', subPath);

    if (CurrentEnv.terminal() !== TerminalType.WindowsTerminal) {
      Logger.failure(
        `Setup for ${folderName} not established for anything but Windows Terminal`
      );
      return;
    }

    // Install pacakges
    Logger.info('Installing yarn packages...');
    const { output: yarnInstallOutput } = await CLIService.execCmd(
      installCommand
    );
    console.log(yarnInstallOutput);

    // See this post for info on how to order these commands:
    // https://superuser.com/questions/1564090/how-to-pass-commands-into-the-shell-opened-in-new-windows-terminal
    // The order of the commands matters when executing windows terminal.
    // It might be nice to setup a class that does this for you.

    // If the commands are opening in a separte window, that is probably because
    // the current window is not `0` for some reason. Although it should be.

    await Promise.all(
      separateTerminalCommands.map(async (command) => {
        return CLIService.execCmd(
          `Start-Process wt.exe -ArgumentList "--window", "0", "split-pane", "--horizontal", "-d", '"${currentPath}"', "pwsh.exe", "-NoExit", "-Command", "& {${command}}"`,
          false,
          undefined,
          true
        );
      })
    );
  };
}

export default projects;
