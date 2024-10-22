import { Logger } from '@aneuhold/core-ts-lib';
import downloadVideos from './downloadVideos.js';
import mergeVideos from './mergeVideos.js';

export default async function downloadAndMergeVideos() {
  const videoFolderNames = await downloadVideos();

  for (const videoFolderName of videoFolderNames) {
    await mergeVideos(videoFolderName);
    Logger.info(`Merged videos in ${videoFolderName} folder`);
  }
}
