import { DR } from '@aneuhold/core-ts-lib';
import fs from 'fs';
import mergeVideos from './mergeVideos.js';

/**
 *
 */
export default async function mergeAllVideos() {
  // Get all folder names in the current directory
  const currentDir = process.cwd();
  const folderNames = await fs.promises.readdir(currentDir);

  for (const videoFolderName of folderNames) {
    try {
      await mergeVideos(videoFolderName);
      DR.logger.info(`Merged videos in ${videoFolderName} folder`);
    } catch {
      DR.logger.error(`Error merging videos in ${videoFolderName} folder`);
      DR.logger.info('Trying next folder...');
    }
  }
}
