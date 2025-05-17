import { DR } from '@aneuhold/core-ts-lib';
import CLIService from '../CLIService.js';

export default class GitService {
  /**
   * Gets the current repository's remote origin URL.
   *
   * @returns The repository URL string, or undefined if an error occurs.
   */
  public static async getCurrentGitRepositoryUrl(): Promise<
    string | undefined
  > {
    try {
      const gitRemoteCommand = 'git config --get remote.origin.url';
      DR.logger.verbose.info(`Executing: ${gitRemoteCommand}`);
      const { output: remoteUrlOutput, didComplete } =
        await CLIService.execCmd(gitRemoteCommand);

      if (!didComplete || !remoteUrlOutput.trim()) {
        DR.logger.error(
          'Could not get remote origin URL. Are you in a git repository with a remote named "origin"?'
        );
        return undefined;
      }

      let repoUrl = remoteUrlOutput.trim();
      DR.logger.verbose.info(`Raw remote URL: ${repoUrl}`);

      // Convert SSH URL to HTTP URL
      if (repoUrl.startsWith('git@')) {
        repoUrl = repoUrl
          .replace(':', '/')
          .replace('git@', 'https://')
          .replace(/\.git$/, ''); // Ensure .git at the end is removed
      } else if (repoUrl.endsWith('.git')) {
        repoUrl = repoUrl.slice(0, -4);
      }

      // Ensure it's an HTTP/HTTPS URL before logging success or attempting to open
      if (!repoUrl.startsWith('http://') && !repoUrl.startsWith('https://')) {
        DR.logger.verbose.info(
          `Converted URL "${repoUrl}" is not a standard HTTP/HTTPS URL.`
        );
        // Optionally, return undefined or throw an error if strict HTTP/HTTPS is required.
        // For now, we'll allow it to proceed, and BrowserService.openUrl might handle it.
      } else {
        DR.logger.verbose.info(`Processed repository URL: ${repoUrl}`);
      }
      return repoUrl;
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e)); // Ensure error is an Error instance
      DR.logger.error('Failed to get repository URL.');
      DR.logger.error(error.message);
      return undefined;
    }
  }
}
