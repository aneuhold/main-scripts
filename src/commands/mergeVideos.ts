import { DR } from '@aneuhold/core-ts-lib';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Merges videos together one after the other given a path to the folder containing
 * the videos.
 *
 * This uses the ffmpeg library to merge the videos together.
 *
 * @param pathToFolder
 */
export default async function mergeVideos(pathToFolder: string) {
  DR.logger.info(`Merging videos in ${pathToFolder}...`);

  // Get the current directory and fetch each file url in videosToDownload, which
  // will be downloaded to that directory
  const currentDir = process.cwd();
  const pathToVideos = path.join(currentDir, pathToFolder);

  // Get the list of files in the directory
  const videos = await fs.promises.readdir(pathToVideos);

  // Filter out the files that are not mp4 files
  const mp4Videos = videos.filter((file) => path.extname(file) === '.mp4');

  // Sort the mp4 files to ensure that they are in the correct order
  mp4Videos.sort((a, b) => {
    const aNumber = Number(a.split('.')[0]);
    const bNumber = Number(b.split('.')[0]);

    return aNumber - bNumber;
  });

  // Create the path to the output file
  const outputFilePath = path.join(pathToVideos, 'merged.mp4');
  const tempFolderPath = path.join(pathToVideos, 'temp');

  // check if the temporary folder exists, if it does, delete it
  if (fs.existsSync(tempFolderPath)) {
    fs.rmSync(tempFolderPath, { recursive: true });
  }

  // Make the temporary folder
  fs.mkdirSync(tempFolderPath);

  // Convert all the videos to a consistent size so they can be merged
  await convertAllVideosToConsistentSize(mp4Videos, pathToVideos);

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
      .on('start', () => {
        DR.logger.info(`Merging videos...`);
      })
      .on('end', () => {
        DR.logger.info(`Merged videos`);
        resolve();
      });
    ffmpegCommand.on('error', (err, stdout, stderr) => {
      // All outputs have to be logged to see detailed error messages
      DR.logger.error(JSON.stringify(err));
      DR.logger.error(stdout as string);
      DR.logger.error(stderr as string);
      reject(new Error('Error merging videos'));
    });
    ffmpegCommand.mergeToFile(outputFilePath, tempFolderPath);
  });
}

/**
 * Converts all videos in the given list to a consistent size.
 *
 * @param mp4Videos The list of mp4 videos to convert.
 * @param pathToVideos The path to the folder containing the videos.
 */
async function convertAllVideosToConsistentSize(
  mp4Videos: string[],
  pathToVideos: string
) {
  // Convert all videos to 1920x1080

  for (const video of mp4Videos) {
    DR.logger.info(`Converting ${video} to 1920x1080...`);

    await convertVideoToConsistentSize(video, pathToVideos);
    DR.logger.info(`Converted ${video} to 1920x1080`);
  }
}

/**
 * Converts a single video to a consistent size.
 *
 * @param videoName The name of the video to convert.
 * @param pathToVideos The path to the folder containing the video.
 */
async function convertVideoToConsistentSize(
  videoName: string,
  pathToVideos: string
) {
  // Change the video file name to a temp file name
  const tempVideoName = `temp-${videoName}`;
  const tempVideoPath = path.join(pathToVideos, tempVideoName);
  const videoPath = path.join(pathToVideos, videoName);
  fs.renameSync(videoPath, tempVideoPath);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(tempVideoPath)
      .videoCodec('h264_nvenc')
      .size('1920x1080')
      .on('start', () => {
        DR.logger.info(`Converting video...`);
      })
      .on('end', () => {
        DR.logger.info(`Converted video`);
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        // All outputs have to be logged to see detailed error messages
        DR.logger.error(JSON.stringify(err));
        DR.logger.error(stdout as string);
        DR.logger.error(stderr as string);
        reject(new Error('Error converting videos'));
      })
      .save(videoPath);
  });

  // Delete the temp file
  fs.rmSync(tempVideoPath);
}
