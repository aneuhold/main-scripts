import { OperatingSystemType } from '../utils/CurrentEnv';

export type AliasInfo = {
  [osType in OperatingSystemType]: string;
};

const aliases: { [command: string]: AliasInfo } = {
  ctb: {
    [OperatingSystemType.Windows]:
      `Function ctbFunc {Set-Location -Path "C:\\Users\\Anton G Neuhold Jr\\Desktop\\Development"}\n` +
      `Set-Alias -Name ctb -Value ctbFunc`,
    [OperatingSystemType.MacOSX]: '',
    [OperatingSystemType.Linux]: '',
    [OperatingSystemType.Unknown]: ''
  }
};

export default aliases;
