import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import ITermService from '../services/applications/ITermService.js';
import CLIService from '../services/CLIService.js';
import CurrentEnv, { TerminalType } from '../utils/CurrentEnv.js';

/**
 * Represents a project, which is typically a repo but is defined primarily
 * by the name of the folder in which it is contained.
 */
export type Project = {
  folderName: string;
  solutionFilePath?: string;
  packageJsonPaths?: string[];
  setup?: () => Promise<void>;
  refresh?: () => Promise<void>;
  nodemonArgs?: { [relativeFolderPath: string]: string[] };
};

export enum FolderName {
  piSpa = 'pi-spa',
  piPlatform = 'pi-platform',
  clientCore = 'client-core',
  piClientOrgManagement = 'pi-client-org-management',
  piClientSurveyTaker = 'pi-client-surveytaker',
  piPerform = 'pi-perform',
  piPermissionsMigrations = 'pi-permissions-migrations',
  piDiagnose = 'pi.diagnose'
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
  'pi-platform': {
    folderName: FolderName.piPlatform,
    setup: setupPiSubTerminalsFunc(FolderName.piPlatform, [
      'yarn client',
      'yarn server'
    ])
  },
  'client-core': {
    folderName: FolderName.clientCore,
    nodemonArgs: {
      '.': ['--ext', 'ts', '--watch', 'src', '--exec', 'local-npm publish']
    },
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
  },
  'pi-client-surveytaker': {
    folderName: FolderName.piClientSurveyTaker,
    setup: setupPiSubTerminalsFunc(
      FolderName.piClientSurveyTaker,
      ['yarn watch:client', 'yarn server'],
      '',
      'yarn i'
    )
  },
  'pi-perform': {
    folderName: FolderName.piPerform,
    setup: setupPiSubTerminalsFunc(
      FolderName.piPerform,
      ['yarn dev-start'],
      '',
      'yarn && bundle'
    )
  },
  'pi-permissions-migrations': {
    folderName: FolderName.piPermissionsMigrations,
    solutionFilePath: 'PIPermissionsMigration.sln'
  },
  'pi.diagnose': {
    folderName: FolderName.piDiagnose,
    packageJsonPaths: ['PI.Client.Diagnose/client/package.json']
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
 * @param installCommand the command to run for installing dependencies
 */
function setupPiSubTerminalsFunc(
  folderName: FolderName,
  separateTerminalCommands: string[],
  subPath = '',
  installCommand = 'yarn yarn:all'
) {
  return async () => {
    const project = projects[folderName];
    DR.logger.info(`Setting up ${project.folderName}...`);
    const currentPath = path.resolve('.', subPath);

    if (CurrentEnv.terminal())
      if (
        CurrentEnv.terminal() !== TerminalType.WindowsTerminal &&
        CurrentEnv.terminal() !== TerminalType.ITerm2
      ) {
        DR.logger.error(
          `Setup for ${folderName} not established for anything but Windows Terminal and iTerm2.`
        );
        return;
      }

    // Install pacakges
    DR.logger.info('Installing yarn packages...');
    const { output: yarnInstallOutput } = await CLIService.execCmd(
      installCommand,
      false,
      currentPath
    );
    console.log(yarnInstallOutput);

    if (CurrentEnv.terminal() === TerminalType.WindowsTerminal) {
      // If the commands are opening in a separte window, that is probably because
      // the current window is not `0` for some reason. Although it should be.
      await runWindowsTerminalCommands(separateTerminalCommands, currentPath);
    } else if (CurrentEnv.terminal() === TerminalType.ITerm2) {
      await runITerm2Commands(separateTerminalCommands, currentPath);
    }
  };
}

// See this post for info on how to order these commands:
// https://superuser.com/questions/1564090/how-to-pass-commands-into-the-shell-opened-in-new-windows-terminal
// The order of the commands matters when executing windows terminal.
// It might be nice to setup a class that does this for you.
/**
 * Runs Windows Terminal commands in separate panes.
 *
 * @param separateTerminalCommands the commands to run in separate terminals
 * @param currentPath the current working directory
 */
async function runWindowsTerminalCommands(
  separateTerminalCommands: string[],
  currentPath: string
) {
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
}

/**
 * Runs iTerm2 commands in separate panes.
 *
 * @param separateTerminalCommands the commands to run in separate terminals
 * @param currentPath the current working directory
 */
async function runITerm2Commands(
  separateTerminalCommands: string[],
  currentPath: string
) {
  await ITermService.splitHorizontallyAndRunCommands(
    separateTerminalCommands,
    currentPath
  );
}

export default projects;
