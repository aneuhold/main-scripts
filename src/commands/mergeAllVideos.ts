import { Logger } from '@aneuhold/core-ts-lib';
import fs from 'fs';
import mergeVideos from './mergeVideos.js';

export default async function mergeAllVideos() {
  // Get all folder names in the current directory
  const currentDir = process.cwd();
  const folderNames = await fs.promises.readdir(currentDir);

  for (const videoFolderName of folderNames) {
    try {
      await mergeVideos(videoFolderName);
      Logger.info(`Merged videos in ${videoFolderName} folder`);
    } catch (e) {
      Logger.error(`Error merging videos in ${videoFolderName} folder`);
      Logger.info('Trying next folder...');
    }
  }
}
