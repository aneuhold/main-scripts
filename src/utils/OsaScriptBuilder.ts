/**
 * A `tell` block that can be executed in an OSA script.
 */
export type OsaScriptTellBlock = {
  /**
   * The command that goes after the `tell` keyword in the first line of the
   * block.
   */
  tellCommand: string;
  sections: OsaScriptSection[];
};

/**
 * A plain command that can be executed in an OSA script.
 */
export type OsaScriptCommand = string;

export type OsaScriptSection = OsaScriptTellBlock | OsaScriptCommand;

export default class OsaScriptBuilder {
  private currentScript: OsaScriptSection[] = [];

  /**
   * Adds a command to the OSA script.
   * There\'s no need to escape single quotes with this. That is already done
   * in the class.
   *
   * @param command The command to add.
   */
  public addCommand(command: string): void {
    this.currentScript.push(command);
  }

  /**
   * Adds a tell block to the OSA script.
   *
   * @param tellBlock The tell block to add.
   */
  public addTellBlock(tellBlock: OsaScriptTellBlock): void {
    this.currentScript.push(tellBlock);
  }

  /**
   * Generates the full command that should be pasted as-is into a terminal.
   *
   * This will automatically escape any single quotes appropriately that were
   * provided.
   */
  getFullCommand(): string {
    let stringifiedScript = `osascript`;
    this.currentScript.forEach((section) => {
      stringifiedScript += this.stringifySection(section);
    });
    return stringifiedScript;
  }

  /**
   * Stringifies an OSA script section.
   *
   * @param section The section to stringify.
   */
  private stringifySection(section: OsaScriptSection): string {
    if (typeof section === 'string') {
      return ` -e '${OsaScriptBuilder.escapeSingleQuotes(section)}'`;
    }
    let stringifiedSection = ` -e 'tell ${OsaScriptBuilder.escapeSingleQuotes(
      section.tellCommand
    )}'`;
    section.sections.forEach((subSection) => {
      stringifiedSection += this.stringifySection(subSection);
    });
    stringifiedSection += ` -e 'end tell'`;
    return stringifiedSection;
  }

  /**
   * Escapes single quotes in a string.
   *
   * @param stringToEscape The string to escape.
   */
  private static escapeSingleQuotes(stringToEscape: string): string {
    return stringToEscape.replace(/'/g, `'\\''`);
  }
}
