import { Logger } from '@aneuhold/core-ts-lib';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Merges videos together one after the other given a path to the folder containing
 * the videos.
 *
 * This uses the ffmpeg library to merge the videos together.
 */
export default async function mergeVideos(pathToFolder: string) {
  Logger.info(`Merging videos in ${pathToFolder}...`);

  // Get the current directory and fetch each file url in videosToDownload, which
  // will be downloaded to that directory
  const currentDir = process.cwd();
  const pathToVideos = path.join(currentDir, pathToFolder);

  // Get the list of files in the directory
  const videos = await fs.promises.readdir(pathToVideos);

  // Filter out the files that are not mp4 files
  const mp4Videos = videos.filter((file) => path.extname(file) === '.mp4');

  // Sort the mp4 files to ensure that they are in the correct order
  mp4Videos.sort();

  // Create the path to the output file
  const outputFilePath = path.join(pathToVideos, 'merged.mp4');
  const tempFolderPath = path.join(pathToVideos, 'temp');
  fs.mkdirSync(tempFolderPath);

  // Merge the videos together
  await new Promise<void>((resolve, reject) => {
    const ffmpegCommand = ffmpeg();

    mp4Videos.forEach((video) => {
      ffmpegCommand.input(path.join(pathToVideos, video));
    });

    ffmpegCommand
      .on('start', () => Logger.info(`Merging videos...`))
      .on('end', () => {
        Logger.info(`Merged videos`);
        resolve();
      })
      .on('error', (err) => {
        Logger.error(err);
        reject();
      })
      .inputOption(['-hwaccel_device 0', '-hwaccel cuda'])
      .mergeToFile(outputFilePath, tempFolderPath);
  });
}
