import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const PARALLEL_DOWNLOAD_LIMIT = 5;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

type ImgurLink = {
  id: string;
  extension: string;
  url: string;
  filename: string;
};

type DownloadOutcome = 'downloaded' | 'skipped' | 'failed';

/**
 * Parses a single CSV line that was written by `extractImgurLinks.ts`,
 * handling the simple double-quoted format used by that script.
 *
 * @param line A single non-empty CSV line.
 */
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};

/**
 * Reads and parses the CSV file produced by the extractor.
 *
 * @param csvPath Absolute path to the CSV file.
 */
const readCsv = async (csvPath: string): Promise<ImgurLink[]> => {
  const content = await readFile(csvPath, 'utf8');
  const lines = content.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const [, ...rows] = lines;
  return rows.map((line) => {
    const [id, extension, url, filename] = parseCsvLine(line);
    return { id, extension, url, filename };
  });
};

/**
 * Pauses execution for the given number of milliseconds.
 *
 * @param ms Duration to sleep.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks whether a file already exists and is non-empty.
 *
 * @param filePath Absolute path to check.
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
};

/**
 * Downloads a single URL to the given destination path with retry + backoff
 * on transient failures. Partial files are cleaned up on error.
 *
 * @param url The URL to download.
 * @param destPath Absolute destination path on disk.
 */
const downloadOne = async (url: string, destPath: string): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        throw new Error(
          `HTTP ${response.status} ${response.statusText} (non-retryable)`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Empty response body');
      }

      await writeFile(destPath, Buffer.from(arrayBuffer));
      return;
    } catch (error) {
      lastError = error;
      try {
        await unlink(destPath);
      } catch {
        // best-effort cleanup
      }

      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('non-retryable') || attempt === MAX_RETRIES) {
        break;
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(
    typeof lastError === 'string' ? lastError : 'Unknown download error'
  );
};

/**
 * Main entry point: reads the CSV and downloads every image into
 * `scripts/imgur/downloads/`, skipping files that already exist.
 */
const main = async (): Promise<void> => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = path.join(scriptDir, 'imgur-links.csv');
  const downloadsDir = path.join(scriptDir, 'downloads');

  await mkdir(downloadsDir, { recursive: true });

  const links = await readCsv(csvPath);
  if (links.length === 0) {
    console.log('No links found in CSV. Run extractImgurLinks first.');
    return;
  }

  console.log(
    `Downloading ${links.length} image(s) to ${downloadsDir} ` +
      `(parallel: ${PARALLEL_DOWNLOAD_LIMIT})`
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < links.length) {
      const index = nextIndex;
      nextIndex += 1;
      const link = links[index];
      const destPath = path.join(downloadsDir, link.filename);

      let outcome: DownloadOutcome;
      try {
        if (await fileExists(destPath)) {
          outcome = 'skipped';
        } else {
          await downloadOne(link.url, destPath);
          outcome = 'downloaded';
        }
      } catch (error) {
        outcome = 'failed';
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${link.filename} -> FAILED: ${message}\n`);
      }

      if (outcome === 'downloaded') {
        downloaded += 1;
        console.log(`${link.filename} -> OK`);
      } else if (outcome === 'skipped') {
        skipped += 1;
        console.log(`${link.filename} -> SKIP (already exists)`);
      } else {
        failed += 1;
      }
    }
  };

  const workerCount = Math.min(PARALLEL_DOWNLOAD_LIMIT, links.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  console.log(
    `\nDone. Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}`
  );
};

await main();
