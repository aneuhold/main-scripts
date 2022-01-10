import { readdir } from 'fs/promises';
import path from 'path';
import projects, { FolderName, Project } from '../projects';
import execCmd, { ExecCmdCommandArgument } from '../helperFunctions/cmd';
import Log from './Log';

/**
 * The type of shell that the current environment is running.
 */
export enum ShellType {
  PowerShellCore,
  PowerShellDesktop,
  Bash,
  Zsh,
  CommandPrompt,
  Unknown,
}

export enum OperatingSystemType {
  Windows,
  MacOSX,
  Linux,
  Unknown,
}

/**
 * The type of terminal that the current enviornment is running.
 */
export enum TerminalType {
  WindowsTerminal,
  Unknown,
}

/**
 * Provides information relevant to the current environment this script is
 * running in.
 */
export default class CurrentEnv {
  /**
   * Returns the type of terminal the current environment is using.
   */
  public static terminal(): TerminalType {
    // See https://stackoverflow.com/questions/59733731/how-to-detect-if-running-in-the-new-windows-terminal
    // for information on why this method was chosen.
    if (process.env.WT_SESSION) {
      return TerminalType.WindowsTerminal;
    }
    return TerminalType.Unknown;
  }

  /**
   * Returns the type of shell the current environment is using.
   *
   * This might be arbitrary because it seems that the exec command will use
   * whatever the default shell is or whatever is specified as the shell
   * option.
   */
  public static async shell(): Promise<ShellType> {
    const currentOs = CurrentEnv.os();
    if (currentOs === OperatingSystemType.Windows) {
      // Command comes from: https://stackoverflow.com/questions/34471956/how-to-determine-if-im-in-powershell-or-cmd
      const { output } = await execCmd(
        '(dir 2>&1 *`|echo CMD);&<# rem #>echo ($PSVersionTable).PSEdition'
      );
      switch (output) {
        case 'CMD':
          return ShellType.CommandPrompt;
        case 'Desktop':
          return ShellType.PowerShellDesktop;
        case 'Core':
          return ShellType.PowerShellCore;
        default:
          Log.verbose.failure(
            `No recognizable shell returned for Windows environment.`
          );
      }
    } else if (currentOs === OperatingSystemType.MacOSX) {
      // Mighbt want to use process.env.SHELL for Linux environments
    }
    return ShellType.Unknown;
  }

  /**
   * Gets all file names in the current directory.
   */
  public static async fileNamesInDir(): Promise<string[]> {
    return readdir(path.resolve('.'));
  }

  /**
   * Runs the startup script for the current system. This command exits the
   * package.
   *
   * The startup scripts are defined in the
   * [dotfiles repo](https://github.com/aneuhold/dotfiles).
   *
   * @param args are the arguements that should be provided to the startup
   * script as a string[]. This can be empty.
   */
  public static async runStartupScript(args?: string[]): Promise<void> {
    let cmd: ExecCmdCommandArgument = '';
    if (CurrentEnv.os() === OperatingSystemType.Windows) {
      // & says to powershell that you actually want to run the script in the
      // quotes afterwards
      // Also just running the startup script for now because of some infinite
      // loop issues with specifying arguments
      cmd = `& "$Home\\startup.ps1"`;
    } else {
      cmd = { command: 'zsh' };
      const tmpArgs: string[] = ['startup.sh'];

      // Add additional arguments
      if (args) {
        args.forEach((arg) => {
          tmpArgs.push(arg);
        });
      }
      cmd.args = tmpArgs;
      await execCmd(cmd, true, process.env.HOME);
      return;
    }

    Log.info(`Executing the following command: "${cmd}"`);
    const { output } = await execCmd(cmd);
    Log.info(output);

    process.exit();
  }

  /**
   * Determines the type of operating system in the current environment.
   */
  public static os(): OperatingSystemType {
    if (process.platform === 'win32') {
      return OperatingSystemType.Windows;
    }
    if (process.platform === 'darwin') {
      return OperatingSystemType.MacOSX;
    }
    return OperatingSystemType.Unknown;
  }

  /**
   * Gets the current project that the environment is in. This is based on the
   * folder name.
   *
   * If undefined is returned, you can get the folder name with {@link folderName}
   *
   * @returns the Project if it matches one of the folder names defined
   * in the projects file or undefined if nothing matches.
   */
  public static project(): Project | undefined {
    const currentFolderName = CurrentEnv.folderName();
    return projects[currentFolderName as FolderName];
  }

  public static folderName(): string {
    return path.basename(path.resolve('.'));
  }
}
