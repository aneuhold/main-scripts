import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv';
import { Application } from './applications';

/**
 * Gets the path to the chrome application for the current system given the
 * operating system type.
 *
 * This does not include the quotes.
 */
function getChromePath(os: OperatingSystemType): string | null {
  switch (os) {
    case OperatingSystemType.MacOSX:
      return `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`;
    default:
      return null;
  }
}

/**
 * Holds the logic pertaining to interacting with the Chrome application,
 * regardless of which platform it is on.
 */
const chromeApplication: Application = {
  async defaultCall() {
    console.log('Do something');
  },
  /**
   * Opens the provided list of URLs, optionally setting them to be pinned
   * tabs or not.
   */
  openAndSetPinnedTabs(
    tabs: [
      {
        url: string;
        isPinned?: boolean;
      }
    ]
  ): void {
    // Sort the tabs so the pinned ones go first, this is required by the
    // chrome things.
    if (CurrentEnv.os === OperatingSystemType.MacOSX) {
      console.log(tabs);
    }
  },
};

export default chromeApplication;
