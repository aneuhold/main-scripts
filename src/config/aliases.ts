import { OperatingSystemType } from '../utils/CurrentEnv';

export type AliasInfo = {
  [osType in OperatingSystemType]: string;
};

/**
 * The list of different aliases that should be set on all operating systems.
 */
const aliases: { [command: string]: AliasInfo } = {
  ctb: {
    [OperatingSystemType.Windows]:
      `Function ctbFunc {ssh aneuhold@137.184.231.32}\n` +
      `Set-Alias -Name ctb -Value ctbFunc`,
    [OperatingSystemType.MacOSX]: '',
    [OperatingSystemType.Linux]: '',
    [OperatingSystemType.Unknown]: ''
  }
};

export default aliases;
