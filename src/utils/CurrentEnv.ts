import { DR } from '@aneuhold/core-ts-lib';
import { readdir } from 'fs/promises';
import path from 'path';
import CLIService from '../services/CLIService.js';

/**
 * The type of shell that the current environment is running.
 */
export enum ShellType {
  PowerShellCore,
  PowerShellDesktop,
  Bash,
  Zsh,
  CommandPrompt,
  Unknown
}

export enum OperatingSystemType {
  Windows,
  MacOSX,
  Linux,
  Unknown
}

/**
 * The type of terminal that the current enviornment is running.
 */
export enum TerminalType {
  WindowsTerminal,
  ITerm2,
  Unknown
}

/**
 * Provides information relevant to the current environment this script is
 * running in.
 */
export default class CurrentEnv {
  /**
   * Gets the type of terminal the current environment is running.
   */
  public static terminal(): TerminalType {
    // See https://stackoverflow.com/questions/59733731/how-to-detect-if-running-in-the-new-windows-terminal
    // for information on why this method was chosen.
    if (process.env.WT_SESSION) {
      return TerminalType.WindowsTerminal;
    }
    if (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM === 'iTerm.app') {
      return TerminalType.ITerm2;
    }
    return TerminalType.Unknown;
  }

  /**
   * Gets the type of shell the current environment is running.
   *
   * This might be arbitrary because it seems that the exec command will use
   * whatever the default shell is or whatever is specified as the shell
   * option.
   */
  public static async shell(): Promise<ShellType> {
    const currentOs = CurrentEnv.os;
    if (currentOs === OperatingSystemType.Windows) {
      // Command comes from: https://stackoverflow.com/questions/34471956/how-to-determine-if-im-in-powershell-or-cmd
      const { output } = await CLIService.execCmd(
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
          DR.logger.verbose.error(
            `No recognizable shell returned for Windows environment.`
          );
      }
    } else if (currentOs === OperatingSystemType.MacOSX) {
      // Might want to use process.env.SHELL for Linux environments
    }
    return ShellType.Unknown;
  }

  /**
   * Gets the names of files in the current directory.
   */
  public static async fileNamesInDir(): Promise<string[]> {
    return readdir(path.resolve('.'));
  }

  /**
   * Runs the startup script for the current environment.
   *
   * The startup scripts are defined in the
   * [dotfiles repo](https://github.com/aneuhold/dotfiles).
   */
  public static async runStartupScript(): Promise<void> {
    let cmd = '';
    if (CurrentEnv.os === OperatingSystemType.Windows) {
      // & says to powershell that you actually want to run the script in the
      // quotes afterwards
      // Also just running the startup script for now because of some infinite
      // loop issues with specifying arguments
      cmd = `& "$Home\\startup.ps1"`;
    } else {
      cmd = 'zsh';
      const args = ['startup.sh'];
      await CLIService.spawnCmd(cmd, args, process.env.HOME);
      return;
    }

    DR.logger.info(`Executing the following command: "${cmd}"`);
    const { output } = await CLIService.execCmd(cmd);
    DR.logger.info(output);

    process.exit();
  }

  /**
   * Gets the current operating system.
   *
   * This looks to be O(1) complexity.
   */
  public static get os(): OperatingSystemType {
    if (process.platform === 'win32') {
      return OperatingSystemType.Windows;
    }
    if (process.platform === 'darwin') {
      return OperatingSystemType.MacOSX;
    }
    return OperatingSystemType.Unknown;
  }

  /**
   * Gets the name of the current folder.
   */
  public static folderName(): string {
    return path.basename(path.resolve('.'));
  }

  /**
   * Gets the command that should be used to open .sln files on the current system.
   *
   * @returns A promise that resolves to the command string to use, or null if no
   * valid command is found. The next string following the returned command should
   * be the path to the .sln file.
   */
  public static async getSolutionFileCommand(): Promise<string> {
    const visualStudioCommand = 'devenv ';
    const riderCommand = 'rider ';
    const vsCodeCommand = 'code ';

    // Check for Rider first
    if (await CurrentEnv.commandExists('rider')) {
      return riderCommand;
    }

    // Check for Visual Studio
    if (CurrentEnv.os === OperatingSystemType.Windows) {
      if (await CurrentEnv.commandExists('devenv')) {
        return visualStudioCommand;
      }
    } else if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      const { output: visualStudioResult } = await CLIService.execCmd(
        'mdfind "kMDItemCFBundleIdentifier == com.microsoft.visual-studio"'
      );
      if (visualStudioResult.length > 0) {
        return visualStudioCommand;
      }
    }

    // Fallback to VS Code
    return vsCodeCommand;
  }

  /**
   * Checks if a command exists in the current environment.
   *
   * @param command
   */
  private static async commandExists(command: string): Promise<boolean> {
    try {
      const cmd =
        CurrentEnv.os === OperatingSystemType.Windows
          ? `get-command ${command}`
          : `which ${command}`;
      const result = await CLIService.execCmd(cmd);
      return result.didComplete;
    } catch {
      return false;
    }
  }
}
