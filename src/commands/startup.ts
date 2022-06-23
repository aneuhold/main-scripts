import { access, appendFile, mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import aliases from '../config/aliases';
import CurrentEnv, { OperatingSystemType } from '../utils/CurrentEnv';
import Log from '../utils/Log';

/**
 * Sets up the Aliases of standard commands that every operating system
 * should have.
 */
async function setupAliases(): Promise<void> {
  if (CurrentEnv.os === OperatingSystemType.Windows) {
    // Write to the windows profile, or find out if it exists.
    const profileDirectory = path.join(os.homedir(), 'Documents', 'PowerShell');
    const fileName = 'Microsoft.PowerShell_profile.ps1';
    const filePath = path.join(profileDirectory, fileName);
    const aliasCode = aliases.ctb.powershell;

    try {
      await access(profileDirectory);
    } catch {
      Log.info(
        `Directory "${profileDirectory}" does not exist. Creating it now...`
      );
      await mkdir(profileDirectory, { recursive: true });
    }

    // See if the file exists. Might be nice to refactor this part to be
    // more maleable and accept multiple aliases.
    try {
      await access(filePath);
      const fileContents = await readFile(filePath);
      if (!fileContents.includes(aliasCode)) {
        await appendFile(filePath, `\n${aliasCode}`);
      }
    } catch {
      await writeFile(filePath, aliasCode);
    }
  }
}

export default async function startup(): Promise<void> {
  await setupAliases();
  await CurrentEnv.runStartupScript();
}
