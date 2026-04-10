import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const HTML_FILE_PATH = '/Users/aneuhold/Downloads/Main (1).html';

type UploadResult = {
  originalName: string;
  status: 'success' | 'failed';
  url?: string;
  error?: string;
};

/**
 * Reads the `upload-results.json` written by `tb img all` and returns the
 * parsed array.
 *
 * @param resultsPath Absolute path to the upload-results.json file.
 */
const readUploadResults = async (
  resultsPath: string
): Promise<UploadResult[]> => {
  const content = await readFile(resultsPath, 'utf8');
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array in ${resultsPath}`);
  }
  return parsed as UploadResult[];
};

/**
 * Replaces every occurrence of `needle` in `haystack` with `replacement`,
 * using a literal string match (no regex). Returns the new string and the
 * number of replacements made.
 *
 * @param haystack The string to search in.
 * @param needle The literal substring to search for.
 * @param replacement The replacement string.
 */
const replaceAllLiteral = (
  haystack: string,
  needle: string,
  replacement: string
): { result: string; count: number } => {
  if (needle.length === 0) {
    return { result: haystack, count: 0 };
  }
  let count = 0;
  let out = '';
  let lastIndex = 0;
  let idx = haystack.indexOf(needle, lastIndex);
  while (idx !== -1) {
    out += haystack.slice(lastIndex, idx) + replacement;
    lastIndex = idx + needle.length;
    count += 1;
    idx = haystack.indexOf(needle, lastIndex);
  }
  out += haystack.slice(lastIndex);
  return { result: out, count };
};

/**
 * Reads the upload results, the original HTML, and rewrites all successful
 * imgur URLs to their new R2 URLs. Writes the result to a sibling file.
 */
const main = async (): Promise<void> => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const resultsPath = path.join(scriptDir, 'downloads', 'upload-results.json');
  const outputHtmlPath = path.join(scriptDir, 'Main-rewritten.html');

  const results = await readUploadResults(resultsPath);
  const successes = results.filter(
    (r): r is UploadResult & { url: string } =>
      r.status === 'success' && typeof r.url === 'string'
  );
  const failures = results.filter((r) => r.status === 'failed');

  console.log(
    `Loaded ${results.length} result(s): ${successes.length} success, ${failures.length} failed`
  );
  if (failures.length > 0) {
    console.log(
      `Leaving imgur URLs intact for ${failures.length} failed upload(s):`
    );
    for (const failure of failures) {
      console.log(`  - ${failure.originalName}: ${failure.error ?? 'unknown'}`);
    }
  }

  let html = await readFile(HTML_FILE_PATH, 'utf8');
  const originalLength = html.length;

  let totalReplacements = 0;
  let urlsWithNoMatches = 0;

  for (const entry of successes) {
    const httpsUrl = `https://i.imgur.com/${entry.originalName}`;
    const httpUrl = `http://i.imgur.com/${entry.originalName}`;

    const httpsReplace = replaceAllLiteral(html, httpsUrl, entry.url);
    html = httpsReplace.result;
    const httpReplace = replaceAllLiteral(html, httpUrl, entry.url);
    html = httpReplace.result;

    const total = httpsReplace.count + httpReplace.count;
    totalReplacements += total;
    if (total === 0) {
      urlsWithNoMatches += 1;
    }
  }

  await writeFile(outputHtmlPath, html, 'utf8');

  console.log(
    `\nTotal replacements made: ${totalReplacements}` +
      `\nSuccess entries with zero matches in HTML: ${urlsWithNoMatches}` +
      `\nHTML size: ${originalLength} -> ${html.length}` +
      `\nWrote: ${outputHtmlPath}`
  );
};

await main();
