import path from 'path';
import execCmd from '../helperFunctions/cmd';
import CurrentEnv, { TerminalType } from '../helperFunctions/CurrentEnv';
import Log from '../helperFunctions/logger';
import projects, { FolderName } from '../projects';

async function setupPiSpa() {
  const project = projects['pi-spa'];
  Log.info(`Setting up ${project.folderName}...`);
  const currentPath = path.resolve('.');

  if (CurrentEnv.terminal() !== TerminalType.WindowsTerminal) {
    Log.failure(
      `Setup for pi-spa not established for anything but Windows Terminal`
    );
    return;
  }

  // Install pacakges
  Log.info('Installing yarn packages...');
  const { output: yarnInstallOutput } = await execCmd('yarn yarn:all');
  console.log(yarnInstallOutput);

  // See this post for info on how to order these commands:
  // https://superuser.com/questions/1564090/how-to-pass-commands-into-the-shell-opened-in-new-windows-terminal
  // The order of the commands matters when executing windows terminal.
  // It might be nice to setup a class that does this for you.

  // Setup second terminal for client
  await execCmd(
    `Start-Process wt -ArgumentList "--window", "0", "split-pane", "--horizontal", "-d", '"${currentPath}"', "pwsh.exe", "-NoExit", "-Command", "& {yarn client}"`
  );

  // Setup third terminal for server
  await execCmd(
    `Start-Process wt -ArgumentList "--window", "0", "split-pane", "--horizontal", "-d", '"${currentPath}"', "pwsh.exe", "-NoExit", "-Command", "& {yarn server}"`
  );
}

export default async function setup(): Promise<void> {
  const currentFolderName = CurrentEnv.folderName();
  switch (currentFolderName) {
    case FolderName.piSpa:
      await setupPiSpa();
      break;
    default:
      Log.failure(
        `There are no settings for the folder with name ${currentFolderName}. Please add them to the main-scripts project.`
      );
      break;
  }
}
