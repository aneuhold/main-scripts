import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import CLIService from '../CLIService.js';

export type WorktreeInfo = {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
};

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

  /**
   * Creates a new git worktree with a new branch.
   *
   * @param branchName The name of the new branch to create
   * @param targetPath The path where the worktree should be created
   */
  public static async addWorktree(
    branchName: string,
    targetPath: string
  ): Promise<void> {
    const command = `git worktree add -b ${branchName} "${targetPath}" ${branchName}`;
    DR.logger.verbose.info(`Executing: ${command}`);

    const { didComplete, output } = await CLIService.execCmd(command);

    if (!didComplete) {
      throw new Error(`Failed to create worktree: ${output}`);
    }

    DR.logger.verbose.info(`Worktree created successfully at: ${targetPath}`);
  }

  /**
   * Gets information about all worktrees in the current repository.
   *
   * @returns Array of worktree info objects
   */
  public static async getWorktreesInfo(): Promise<WorktreeInfo[]> {
    const command = 'git worktree list --porcelain';
    DR.logger.verbose.info(`Executing: ${command}`);

    const { didComplete, output } = await CLIService.execCmd(command);

    if (!didComplete) {
      throw new Error('Failed to get worktree information');
    }

    const worktrees: WorktreeInfo[] = [];
    const lines = output.trim().split('\n');
    let currentWorktree: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as WorktreeInfo);
        }
        currentWorktree = { path: line.slice(9), isMain: false };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.slice(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        currentWorktree.isMain = true;
      } else if (line === '') {
        if (currentWorktree.path) {
          // First worktree is always the main one. See docs for more info.
          // https://git-scm.com/docs/git-worktree
          if (worktrees.length === 0) {
            currentWorktree.isMain = true;
          }
          worktrees.push(currentWorktree as WorktreeInfo);
          currentWorktree = {};
        }
      }
    }

    // Don't forget the last worktree
    if (currentWorktree.path) {
      if (worktrees.length === 0) {
        currentWorktree.isMain = true;
      }
      worktrees.push(currentWorktree as WorktreeInfo);
    }

    return worktrees;
  }

  /**
   * Removes a git worktree at the specified path.
   *
   * @param targetPath The path to the worktree to remove
   * @param force Whether to force removal even with uncommitted changes
   */
  public static async removeWorktree(
    targetPath: string,
    force = false
  ): Promise<void> {
    const forceFlag = force ? '--force' : '';
    const command = `git worktree remove ${forceFlag} "${targetPath}"`;
    DR.logger.verbose.info(`Executing: ${command}`);

    const { didComplete, output } = await CLIService.execCmd(command);

    if (!didComplete) {
      throw new Error(`Failed to remove worktree: ${output}`);
    }

    DR.logger.verbose.info(`Worktree removed successfully: ${targetPath}`);
  }

  /**
   * Prunes stale worktree administrative data.
   */
  public static async pruneWorktrees(): Promise<void> {
    const command = 'git worktree prune';
    DR.logger.verbose.info(`Executing: ${command}`);

    const { didComplete, output } = await CLIService.execCmd(command);

    if (!didComplete) {
      throw new Error(`Failed to prune worktrees: ${output}`);
    }

    DR.logger.verbose.info('Worktrees pruned successfully');
  }

  /**
   * Gets the main worktree path for the current repository.
   *
   * @returns The path to the main worktree
   */
  public static async getMainWorktreePath(): Promise<string> {
    const worktrees = await this.getWorktreesInfo();
    const mainWorktree = worktrees.find((wt) => wt.isMain);

    if (!mainWorktree) {
      throw new Error('Could not find main worktree');
    }

    return mainWorktree.path;
  }

  /**
   * Checks if the current directory is a worktree and returns the associated
   * main project folder name by checking if any worktree path corresponds
   * to a known project configuration.
   *
   * @returns The main project folder name, or undefined if not a worktree
   */
  public static async getMainProjectFromWorktree(): Promise<
    string | undefined
  > {
    try {
      const worktrees = await this.getWorktreesInfo();
      const currentPath = process.cwd();

      // Check if current path matches any worktree
      const currentWorktree = worktrees.find((wt) => wt.path === currentPath);

      // Return nothing if not a worktree or is the main worktree (because if the worktree is the
      // main one then we are not in a worktree)
      if (!currentWorktree || currentWorktree.isMain) {
        return undefined;
      }

      // Find the main worktree
      const mainWorktree = worktrees.find((wt) => wt.isMain);
      if (!mainWorktree) {
        return undefined;
      }

      // Extract folder name from main worktree path
      const mainFolderName = path.basename(mainWorktree.path);
      return mainFolderName;
    } catch (error) {
      DR.logger.verbose.error(
        `Failed to get main project from worktree: ${String(error)}`
      );
      return undefined;
    }
  }
}
