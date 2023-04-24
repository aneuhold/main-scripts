import { Logger } from '@aneuhold/core-ts-lib';
import downloadVideos from './downloadVideos';
import mergeVideos from './mergeVideos';

export default async function downloadAndMergeVideos() {
  const videoFolderNames = await downloadVideos();

  // eslint-disable-next-line no-restricted-syntax
  for (const videoFolderName of videoFolderNames) {
    // eslint-disable-next-line no-await-in-loop
    await mergeVideos(videoFolderName);
    Logger.info(`Merged videos in ${videoFolderName} folder`);
  }
}
