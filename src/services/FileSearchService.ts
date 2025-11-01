import fs from 'fs';
import path from 'path';

export default class FileSearchService {
  /**
   * Searches for files with specific extensions recursively up to a maximum depth
   *
   * @param startPath The path to start searching from.
   * @param extension The file extension to search for.
   * @param maxDepth The maximum depth to search.
   * @param currentDepth The current depth in the search.
   */
  static async findFilesWithExtension(
    startPath: string,
    extension: string,
    maxDepth = 4,
    currentDepth = 0
  ): Promise<string[]> {
    if (currentDepth >= maxDepth) return [];

    const files = await fs.promises.readdir(startPath);
    const results: string[] = [];

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
      } else if (path.extname(file) === `.${extension}`) {
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
