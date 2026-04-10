import fs from 'fs';
import path from 'path';

export default class FileSearchService {
  /**
   * Searches for files with one or more extensions recursively up to a
   * maximum depth. Extension matching is case-insensitive.
   *
   * @param startPath The path to start searching from.
   * @param extension The file extension (or extensions) to search for,
   * without the leading dot. E.g. `'sln'` or `['png', 'jpg']`.
   * @param maxDepth The maximum depth to search.
   * @param currentDepth The current depth in the search.
   */
  static async findFilesWithExtension(
    startPath: string,
    extension: string | string[],
    maxDepth = 4,
    currentDepth = 0
  ): Promise<string[]> {
    if (currentDepth >= maxDepth) return [];

    const files = await fs.promises.readdir(startPath);
    const results: string[] = [];
    const allowedExtnames = new Set(
      (typeof extension === 'string' ? [extension] : extension).map(
        (ext) => `.${ext.toLowerCase()}`
      )
    );

    for (const file of files) {
      const filePath = path.join(startPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        const nestedFiles = await this.findFilesWithExtension(
          filePath,
          extension,
          maxDepth,
          currentDepth + 1
        );
        results.push(...nestedFiles);
      } else if (allowedExtnames.has(path.extname(file).toLowerCase())) {
        results.push(filePath);
      }
    }

    return results;
  }

  /**
   * Checks if a file exists in the given directory
   *
   * @param dirPath The directory path to check in.
   * @param fileName The name of the file to check for.
   */
  static async fileExistsInDir(
    dirPath: string,
    fileName: string
  ): Promise<boolean> {
    const filePath = path.join(dirPath, fileName);
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
