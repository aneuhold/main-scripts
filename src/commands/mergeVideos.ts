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

  // check if the temporary folder exists, if it does, delete it
  if (fs.existsSync(tempFolderPath)) {
    fs.rmSync(tempFolderPath, { recursive: true });
  }

  // Make the temporary folder
  fs.mkdirSync(tempFolderPath);

  // Merge the videos together
  await new Promise<void>((resolve, reject) => {
    const ffmpegCommand = ffmpeg();

    ffmpegCommand
      // videoCodec has to go at the very beginning of the command. Otherwise
      // it will not work.
      .videoCodec('h264_nvenc')
      // FPS output has to go at the beginning as well. This has to be set
      // to a value otherwise FFMPEG will make the framerate whatever it seems
      // to feel like 😂. So there is a bunch of fragmentation unless this is
      // set.
      .FPSOutput(60);

    mp4Videos.forEach((video) => {
      ffmpegCommand.addInput(path.join(pathToVideos, video));
    });

    // -hwaccel is only an input option. Not an output option. This doesn't
    // really help much it seems though.
    // ffmpegCommand.addInputOptions('-hwaccel cuda');

    ffmpegCommand
      .on('start', () => Logger.info(`Merging videos...`))
      .on('end', () => {
        Logger.info(`Merged videos`);
        resolve();
      });
    ffmpegCommand.on('error', (err, stdout, stderr) => {
      // All outputs have to be logged to see detailed error messages
      Logger.error(err);
      Logger.error(stdout);
      Logger.error(stderr);
      reject();
    });
    ffmpegCommand.mergeToFile(outputFilePath, tempFolderPath);
  });
}
