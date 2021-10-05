/**
 * The type of shell that the current environment is running.
 */
export enum ShellType {
  PowerShell,
  Bash,
  Zsh,
  Unknown,
}

/**
 * The type of terminal that the current enviornment is running.
 */
export enum TerminalType {
  WindowsTerminal,
  Unknown,
}

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
}
