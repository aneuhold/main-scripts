import chromeApplication from './chromeApplication';

export type Application = {
  defaultCall: () => void;
  [functionName: string]: unknown;
};

export enum AppName {
  chrome = 'chrome',
}

/**
 * Holds logic pertaining to running and using individual applications on the
 * current system.
 */
const applications: { [appName in AppName]: Application } = {
  chrome: chromeApplication,
};

export default applications;
