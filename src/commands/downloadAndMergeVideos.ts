import { DR } from '@aneuhold/core-ts-lib';
import downloadVideos from './downloadVideos.js';
import mergeVideos from './mergeVideos.js';

/**
 * Downloads videos from the internet and then merges them.
 */
export default async function downloadAndMergeVideos() {
  const videoFolderNames = await downloadVideos();

  for (const videoFolderName of videoFolderNames) {
    await mergeVideos(videoFolderName);
    DR.logger.info(`Merged videos in ${videoFolderName} folder`);
  }
}
