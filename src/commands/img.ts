import { DR, ErrorUtils } from '@aneuhold/core-ts-lib';
import { select } from '@inquirer/prompts';
import clipboard from 'clipboardy';
import { randomBytes } from 'crypto';
import { Stats } from 'fs';
import { stat, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import R2Service from '../services/applications/R2Service.js';
import { ConfigService } from '../services/ConfigService.js';
import FileSearchService from '../services/FileSearchService.js';

export type ImgOptions = {
  latest?: boolean;
  delete?: boolean;
  dir?: string;
};

export type ImgAllOptions = {
  dir?: string;
  delete?: boolean;
  dryRun?: boolean;
};

const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'svg',
  'avif'
];
const MAX_PICKER_ENTRIES = 20;

type ImageEntry = {
  absolutePath: string;
  basename: string;
  stats: Stats;
};

/**
 * Picks an image from the configured folder, uploads it to Cloudflare R2,
 * prints the resulting URL, and copies it to the clipboard.
 *
 * @param options Command options.
 */
export default async function img(options: ImgOptions): Promise<void> {
  const entries = await getImageEntries(options.dir);
  if (!entries) return;

  const selected = options.latest
    ? entries[0]
    : await select<ImageEntry>({
        message: 'Select an image to upload:',
        choices: entries.slice(0, MAX_PICKER_ENTRIES).map((entry) => ({
          name: `${entry.basename}  (${formatRelativeTime(Date.now() - entry.stats.mtimeMs)})`,
          value: entry
        }))
      });

  const remoteKey = buildRemoteKey(selected.basename);
  let url: string;
  try {
    url = await R2Service.uploadFile(selected.absolutePath, remoteKey);
  } catch (error) {
    DR.logger.error(`Upload failed: ${ErrorUtils.getErrorString(error)}`);
    return;
  }

  console.log(url);
  try {
    await clipboard.write(url);
    DR.logger.success('Copied URL to clipboard');
  } catch (error) {
    DR.logger.warn(
      `Could not copy to clipboard: ${ErrorUtils.getErrorString(error)}`
    );
  }

  if (options.delete && (await tryDelete(selected.absolutePath))) {
    DR.logger.info(`Deleted local file: ${selected.absolutePath}`);
  }
}

/**
 * Bulk-uploads every image in a directory to Cloudflare R2, printing one
 * `originalName -> url` line per file.
 *
 * @param options Command options.
 */
export async function imgAll(options: ImgAllOptions): Promise<void> {
  const entries = await getImageEntries(options.dir);
  if (!entries) return;

  if (options.dryRun) {
    DR.logger.info(`Would upload ${entries.length} file(s):`);
    for (const entry of entries) {
      console.log(entry.basename);
    }
    return;
  }

  const results = await Promise.all(
    entries.map(async (entry) => {
      const remoteKey = buildRemoteKey(entry.basename);
      try {
        const url = await R2Service.uploadFile(entry.absolutePath, remoteKey);
        console.log(`${entry.basename} -> ${url}`);
      } catch (error) {
        DR.logger.error(
          `${entry.basename} upload failed: ${ErrorUtils.getErrorString(error)}`
        );
        return false;
      }
      if (options.delete) await tryDelete(entry.absolutePath);
      return true;
    })
  );

  const successCount = results.filter(Boolean).length;
  DR.logger.info(
    `Uploaded ${successCount}, failed ${results.length - successCount}`
  );
}

/**
 * Resolves the source directory, lists image files sorted newest-first,
 * and returns `null` (with the reason already logged) if there is nothing
 * to work with.
 *
 * @param dirFlag The `--dir` value if provided by the user.
 */
const getImageEntries = async (
  dirFlag: string | undefined
): Promise<ImageEntry[] | null> => {
  const config = await ConfigService.loadConfig();
  if (!config.img) {
    DR.logger.error(
      'No `img` configuration found. See docs/img-upload-initial-setup.md ' +
        'for setup instructions.'
    );
    return null;
  }

  const raw = dirFlag ?? config.img.pickerDir;
  const sourceDir =
    raw === '~'
      ? os.homedir()
      : raw.startsWith('~/')
        ? path.join(os.homedir(), raw.slice(2))
        : path.resolve(raw);

  try {
    const stats = await stat(sourceDir);
    if (!stats.isDirectory()) {
      DR.logger.error(`Not a directory: ${sourceDir}`);
      return null;
    }
  } catch {
    DR.logger.error(`Directory does not exist: ${sourceDir}`);
    return null;
  }

  const paths = await FileSearchService.findFilesWithExtension(
    sourceDir,
    IMAGE_EXTENSIONS,
    1
  );
  if (paths.length === 0) {
    DR.logger.info(`No image files found in ${sourceDir}`);
    return null;
  }

  const entries = await Promise.all(
    paths.map(async (absolutePath) => ({
      absolutePath,
      basename: path.basename(absolutePath),
      stats: await stat(absolutePath)
    }))
  );
  entries.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  return entries;
};

/**
 * Deletes a local file, logging a warning on failure. Returns `true` if
 * the file was removed.
 *
 * @param absolutePath The absolute path to delete.
 */
const tryDelete = async (absolutePath: string): Promise<boolean> => {
  try {
    await unlink(absolutePath);
    return true;
  } catch (error) {
    DR.logger.warn(
      `Could not delete ${absolutePath}: ${ErrorUtils.getErrorString(error)}`
    );
    return false;
  }
};

/**
 * Builds the remote object key `YYYYMMDD-HHMMSS-<4hex>.<ext>`.
 *
 * @param originalName The original basename of the file being uploaded.
 */
const buildRemoteKey = (originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-${randomBytes(2).toString('hex')}${ext}`;
};

/**
 * Formats a millisecond duration as `Xs ago`, `Xm ago`, `Xh ago`, or
 * `Xd ago`.
 *
 * @param diffMs The duration in milliseconds.
 */
const formatRelativeTime = (diffMs: number): string => {
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
};
