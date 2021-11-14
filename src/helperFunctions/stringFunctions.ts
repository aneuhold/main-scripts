/**
 * Gets the file extension of the provided file name.
 *
 * @param fileName the full name of the file or the entire file path
 * @returns a string containing the extension of the file name or undefined
 * if there is no extension
 */
export default function getFileNameExtension(
  fileName: string
): string | undefined {
  return fileName.split('.').pop();
}

/**
 * Converts the given arguments to a string array with only the arguments
 * passed to this package.
 *
 * @param args
 * @returns
 */
export function convertArgsToStringArr(args: string[]): string {
  // Remove first two because those are not the actual args
  const argsThatMatter = args.splice(0, 2);
  // Join on a space
  return argsThatMatter.join(' ');
}
