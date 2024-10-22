import { Logger } from '@aneuhold/core-ts-lib';
import fs, { writeFile } from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { promisify } from 'util';
import videosToDownload from '../config/videosToDownload.js';

const writeFilePromise = promisify(writeFile);

/**
 * Downloads videos from the internet to the provided folder path using the
 * locally setup `videosToDownload.ts` file.
 */
export default async function downloadVideos(
  downloadInParallel = true
): Promise<string[]> {
  Logger.info('Getting videos to download...');

  // Get the current directory and fetch each file url in videosToDownload, which
  // will be downloaded to that directory
  const currentDir = process.cwd();
  const videoFolderNames: string[] = [];

  for (const videoSeries of videosToDownload) {
    // Create a new folder for the videos
    const newFolderName = videoSeries.title;
    videoFolderNames.push(newFolderName);
    const newFolderPath = path.join(currentDir, newFolderName);
    Logger.info(`Creating folder ${newFolderName} at ${newFolderPath}...`);
    fs.mkdirSync(newFolderPath);

    // Download each video
    if (downloadInParallel) {
      await Promise.all(
        videoSeries.urls.map(async (url, index) => {
          await downloadVideoAndLogInfo(url, index, newFolderPath);
        })
      );
    } else {
      for (const [index, url] of videoSeries.urls.entries()) {
        await downloadVideoAndLogInfo(url, index, newFolderPath);
      }
    }
  }
  return videoFolderNames;
}

async function downloadVideoAndLogInfo(
  url: string,
  index: number,
  newFolderPath: string
) {
  const videoName = `${index + 1}.mp4`;
  const videoPath = path.join(newFolderPath, videoName);
  Logger.info(`Downloading ${videoName} to ${newFolderPath}...`);
  await download(url, videoPath);
  Logger.info(`Downloaded ${videoName} to ${newFolderPath}`);
}

/**
 * Downloads a file from a url to a local path
 */
async function download(url: string, dest: string) {
  await fetch(url)
    .then((x) => x.arrayBuffer())
    .then((x) => writeFilePromise(dest, new Uint8Array(x)));
}
