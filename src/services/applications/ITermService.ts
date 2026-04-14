import { DR } from '@aneuhold/core-ts-lib';
import OsaScriptBuilder, {
  OsaScriptTellBlock
} from '../../utils/OsaScriptBuilder.js';
import CLIService from '../CLIService.js';

export default class ITermService {
  /**
   * Opens a new iTerm tab in the current window, splits it vertically, and
   * runs the given command in the right-hand pane. The left-hand pane is
   * left alone so the user can keep using it.
   *
   * @param command The command to run in the right pane of the new tab.
   * @param cwd The current working directory for the command.
   */
  static async openNewTabSplitVerticallyAndRunCommand(
    command: string,
    cwd = ''
  ) {
    const newTabTellBlock: OsaScriptTellBlock = {
      tellCommand: 'W',
      sections: [
        'set T to (create tab with default profile)',
        {
          tellCommand: `T's current session`,
          sections: ['split vertically with default profile']
        },
        `write T's session 1 text "cd ${cwd}"`,
        `write T's session 2 text "cd ${cwd} && ${command}"`
      ]
    };

    const iTermApplicationTellBlock: OsaScriptTellBlock = {
      tellCommand: 'application "iTerm"',
      sections: [
        'activate',
        'set W to current window',
        'if W = missing value then set W to create window with default profile',
        newTabTellBlock
      ]
    };

    const osaScriptBuilder = new OsaScriptBuilder();
    osaScriptBuilder.addTellBlock(iTermApplicationTellBlock);
    const osaScript = osaScriptBuilder.getFullCommand();
    DR.logger.verbose.info(`OsaScript: ${osaScript}`);
    await CLIService.execCmd(osaScript);
  }
}
