import {
  CurrentEnv,
  FileSystemService,
  OperatingSystemType
} from '@aneuhold/core-ts-lib';
import os from 'os';
import path from 'path';
import aliases from '../config/aliases';

/**
 * Sets up the Aliases of standard commands that every operating system
 * should have.
 */
export async function setupAliases(): Promise<void> {
  const aliasCode = aliases.ctb[CurrentEnv.os];

  if (CurrentEnv.os === OperatingSystemType.Windows) {
    // Write to the windows profile, or find out if it exists.
    const profileDirectory = path.join(os.homedir(), 'Documents', 'PowerShell');
    const fileName = 'Microsoft.PowerShell_profile.ps1';
    await FileSystemService.findAndInsertText(
      profileDirectory,
      fileName,
      aliasCode
    );
  } else if (CurrentEnv.os === OperatingSystemType.MacOSX) {
    const fileName = '.zshrc';
    await FileSystemService.findAndInsertText(
      os.homedir(),
      fileName,
      aliasCode
    );
  }
}

export default async function startup(): Promise<void> {
  await setupAliases();
  await CurrentEnv.runStartupScript();
}
