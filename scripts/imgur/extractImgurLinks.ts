import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const HTML_FILE_PATH = '/Users/aneuhold/Downloads/Main (1).html';

const IMGUR_URL_REGEX =
  /https?:\/\/i\.imgur\.com\/([A-Za-z0-9]+)\.(png|jpg|jpeg|gif|webp)/gi;

type ImgurLink = {
  id: string;
  extension: string;
  url: string;
  filename: string;
};

/**
 * Escapes a value for safe inclusion in a CSV cell. Wraps the value in
 * double-quotes and doubles any embedded quotes.
 *
 * @param value The raw cell value.
 */
const csvEscape = (value: string): string => {
  return `"${value.replace(/"/g, '""')}"`;
};

/**
 * Extracts every unique `i.imgur.com` image URL from the hardcoded HTML file
 * and writes them to a CSV alongside this script.
 */
const main = async (): Promise<void> => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputCsvPath = path.join(scriptDir, 'imgur-links.csv');

  const html = await readFile(HTML_FILE_PATH, 'utf8');

  const seen = new Set<string>();
  const links: ImgurLink[] = [];

  for (const match of html.matchAll(IMGUR_URL_REGEX)) {
    const id = match[1];
    const extension = match[2].toLowerCase();
    const normalizedUrl = `https://i.imgur.com/${id}.${extension}`;

    if (seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);

    links.push({
      id,
      extension,
      url: normalizedUrl,
      filename: `${id}.${extension}`
    });
  }

  links.sort((a, b) => a.id.localeCompare(b.id));

  const header = 'id,extension,url,filename';
  const rows = links.map((link) =>
    [
      csvEscape(link.id),
      csvEscape(link.extension),
      csvEscape(link.url),
      csvEscape(link.filename)
    ].join(',')
  );
  const csv = [header, ...rows].join('\n') + '\n';

  await writeFile(outputCsvPath, csv, 'utf8');

  console.log(`Extracted ${links.length} unique imgur URL(s)`);
  console.log(`Wrote CSV: ${outputCsvPath}`);
};

await main();
