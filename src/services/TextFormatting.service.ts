/**
 * A service that formats values into text for display.
 */
export default class TextFormattingService {
  /**
   * Formats a number of bytes into a human readable string.
   *
   * @param bytes the number of bytes to format
   */
  public static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }
}
