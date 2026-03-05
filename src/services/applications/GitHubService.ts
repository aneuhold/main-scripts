import { DR } from '@aneuhold/core-ts-lib';
import CLIService from '../CLIService.js';

/**
 * A service for operations that interact with the GitHub CLI (`gh`).
 */
export default class GitHubService {
  /**
   * Gets the URL of the open pull request for the given branch.
   *
   * @param branchName The branch name to look up.
   * @returns The PR URL if one exists, or `undefined` if no open PR was found.
   */
  static async getPullRequestUrl(
    branchName: string
  ): Promise<string | undefined> {
    if (!(await this.ensureGhAvailable())) {
      return undefined;
    }

    const { output, didComplete } = await CLIService.execCmd(
      `gh pr view "${branchName}" --json url --jq .url`,
      false
    );

    if (didComplete && output.trim()) {
      return output.trim();
    }

    return undefined;
  }

  /**
   * Checks if the GitHub CLI (`gh`) is installed and available.
   *
   * @returns `true` if `gh` is available, `false` otherwise.
   */
  private static async isGhAvailable(): Promise<boolean> {
    const { didComplete } = await CLIService.execCmd('gh --version', false);
    return didComplete;
  }

  /**
   * Ensures the GitHub CLI is available, logging an error if not.
   *
   * @returns `true` if `gh` is available, `false` otherwise.
   */
  private static async ensureGhAvailable(): Promise<boolean> {
    const available = await this.isGhAvailable();
    if (!available) {
      DR.logger.error(
        'The GitHub CLI (gh) is not installed or not available on PATH. ' +
          'Install it from https://cli.github.com/'
      );
    }
    return available;
  }
}
