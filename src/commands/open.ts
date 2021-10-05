import execCmd from '../helperFunctions/cmd';
import CurrentEnv from '../helperFunctions/CurrentEnv';
import Log from '../helperFunctions/logger';
import getFileNameExtension from '../helperFunctions/stringFunctions';
import projects, { FolderName } from '../projects';

export default async function open(): Promise<void> {
  const currentFolderName = CurrentEnv.folderName() as FolderName;

  // If there is already a solution file that should be chosen
  if (projects[currentFolderName]?.solutionFilePath) {
    await execCmd(`devenv "${projects[currentFolderName].solutionFilePath}"`);
    return;
  }

  const fileNamesInDir = await CurrentEnv.fileNamesInDir();
  const filesWithSlnExtension = fileNamesInDir.filter(
    (fileName) => getFileNameExtension(fileName) === 'sln'
  );

  if (filesWithSlnExtension.length > 1) {
    Log.failure(
      `There were more than 1 solution files that were found. The solution files that were found were: `
    );
    console.log(filesWithSlnExtension);
    return;
  }
  if (filesWithSlnExtension.length > 0) {
    Log.success(`Opening ${filesWithSlnExtension[0]} in Visual Studio...`);
    await execCmd(`devenv ${filesWithSlnExtension[0]}`);
    return;
  }

  // All else fails, open VS Code 😁
  Log.success(`Opening current directory in VS Code...`);
  await execCmd(`code .`);
}
