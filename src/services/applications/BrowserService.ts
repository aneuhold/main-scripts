import { DR } from '@aneuhold/core-ts-lib';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLIService.js';

/**
 * A service for opening URLs in the default browser.
 */
export default class BrowserService {
  /**
   * Opens the given URL in the default web browser.
   *
   * @param url The URL to open.
   */
  static async openUrl(url: string): Promise<void> {
    let command = '';
    const os = CurrentEnv.os;

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      DR.logger.error(`Invalid URL provided: ${url}`);
      return;
    }

    switch (os) {
      case OperatingSystemType.MacOSX:
        command = `open "${url}"`;
        break;
      case OperatingSystemType.Windows:
        command = `start "" "${url}"`; // The empty quotes are for title in start command
        break;
      case OperatingSystemType.Linux:
        command = `xdg-open "${url}"`; // Common command for Linux
        break;
      default:
        DR.logger.error('Operating system not supported for opening URLs.');
        return;
    }

    DR.logger.info(`Executing: ${command}`);
    const { didComplete, output } = await CLIService.execCmd(command);
    if (!didComplete) {
      DR.logger.error(`Failed to open URL: ${url}. Output: ${output}`);
    } else {
      DR.logger.success(`Successfully initiated opening URL: ${url}`);
    }
  }
}
