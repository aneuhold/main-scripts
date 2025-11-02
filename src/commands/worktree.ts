import {
  DR,
  ErrorUtils,
  FileSystemService,
  GlobMatchingService
} from '@aneuhold/core-ts-lib';
import { select } from '@inquirer/prompts';
import { copy } from 'fs-extra';
import path from 'path';
import GitService from '../services/applications/GitService.js';
import VSCodeService from '../services/applications/VSCodeService.js';
import CLIService from '../services/CLIService.js';
import { ConfigService } from '../services/ConfigService.js';
import { ProjectConfigService } from '../services/ProjectConfigService.js';
import CurrentEnv from '../utils/CurrentEnv.js';
import open from './open.js';

/**
 * Creates a new worktree with optional branch name.
 * If no branch name provided, uses smart defaults.
 *
 * @param branchName Optional branch name. If not provided, creates worktree on main or temp branch
 */
export async function addWorktree(branchName?: string): Promise<void> {
  try {
    const currentFolder = CurrentEnv.folderName();
    const project = await ProjectConfigService.getCurrentProject();
    const config = await ConfigService.loadConfig();

    // Validate we're in a git repository
    const { didComplete: isGitRepo } = await CLIService.execCmd(
      'git rev-parse --git-dir'
    );
    if (!isGitRepo) {
      DR.logger.error('Not in a git repository');
      return;
    }

    // Determine branch name if not provided
    let targetBranch = branchName;
    if (!targetBranch) {
      targetBranch = await getSmartDefaultBranch();
    }

    // Calculate target path
    const worktreeName = `${currentFolder}-wt-${targetBranch}`;
    const baseDir = config.worktreeBaseDir || '../';
    const targetPath = path.resolve(process.cwd(), baseDir, worktreeName);

    DR.logger.info(
      `Creating worktree for branch '${targetBranch}' at ${targetPath}...`
    );

    // Create worktree with new branch
    await GitService.addWorktree(targetBranch, targetPath);

    // Change to the new worktree directory
    process.chdir(targetPath);
    DR.logger.info(`Changed directory to: ${targetPath}`);

    // Copy extra files if configured
    if (project?.worktreeConfig?.extraFilesToCopy) {
      await copyExtraFiles(project.worktreeConfig.extraFilesToCopy);
    }

    // Copy VS Code workspace storage from the source workspace to the worktree
    try {
      const sourceWorkspacePath = await GitService.getMainWorktreePath();
      await VSCodeService.copyWorkspaceStorage(
        sourceWorkspacePath,
        targetPath,
        {
          // Exclude chat sessions as they can be large and are typically not needed
          // exclude: ['chatSessions', 'chatEditingSessions']
        }
      );
    } catch (error) {
      DR.logger.warn(
        `Could not copy VS Code workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
      DR.logger.info(
        'This is not critical - VS Code will create fresh settings when you open the worktree.'
      );
    }

    // Run postCreate commands if configured
    if (project?.worktreeConfig?.postCreateCommands) {
      DR.logger.info('Running post-create commands...');
      for (const cmd of project.worktreeConfig.postCreateCommands) {
        DR.logger.info(`Running: ${cmd}`);
        const { output } = await CLIService.execCmd(cmd, false, targetPath);
        console.log(output);
      }
    }

    // Run setup if autoSetup is true
    if (project?.worktreeConfig?.autoSetup && project.setup) {
      DR.logger.info('Running project setup...');
      try {
        await project.setup();
      } catch (error) {
        DR.logger.error(`Setup failed: ${ErrorUtils.getErrorString(error)}`);
        DR.logger.warn('Worktree created but setup encountered errors');
      }
    }

    // Open the project in the appropriate editor
    await open();

    DR.logger.success(`Worktree created successfully at: ${targetPath}
cd ${targetPath}`);
  } catch (error) {
    DR.logger.error(
      `Failed to create worktree: ${ErrorUtils.getErrorString(error)}`
    );
  }
}

/**
 * Gets smart default branch name based on current branch.
 * If on main/master, creates temp branch. Otherwise, creates worktree on main.
 *
 * @returns The branch name to use
 */
async function getSmartDefaultBranch(): Promise<string> {
  // Get current branch name
  const { output: currentBranch } = await CLIService.execCmd(
    'git branch --show-current'
  );
  const branch = currentBranch.trim();

  // Check if we're on main or master
  if (branch === 'main' || branch === 'master') {
    // Find next available temp branch
    for (let tempNum = 1; tempNum < 1000; tempNum++) {
      const tempBranch = `temp${tempNum}`;
      const { didComplete } = await CLIService.execCmd(
        `git show-ref --verify refs/heads/${tempBranch}`
      );
      if (!didComplete) {
        // Branch doesn't exist, use it
        return tempBranch;
      }
    }
    // Fallback if we somehow can't find an available temp branch
    return `temp-${Date.now()}`;
  }

  // Return main or master (check which exists)
  const { didComplete: hasMain } = await CLIService.execCmd(
    'git show-ref --verify refs/heads/main'
  );
  if (hasMain) {
    return 'main';
  }
  return 'master';
}

/**
 * Copies extra files from the main project directory to the worktree.
 *
 * @param patterns File names or glob patterns to copy
 */
async function copyExtraFiles(patterns: string[]): Promise<void> {
  try {
    const mainWorktreePath = await GitService.getMainWorktreePath();
    const currentPath = process.cwd();

    DR.logger.info('Copying extra files...');

    // Get all files from main worktree
    const allFiles = await FileSystemService.getAllFilePaths(mainWorktreePath);

    // Get matching files using GlobMatchingService
    const matchingFiles = GlobMatchingService.getMatchingFiles(
      allFiles,
      mainWorktreePath,
      patterns,
      []
    );

    if (matchingFiles.length === 0) {
      DR.logger.verbose.info('No files matched the provided patterns');
      return;
    }

    for (const sourcePath of matchingFiles) {
      try {
        const relativePath = path.relative(mainWorktreePath, sourcePath);
        const destPath = path.join(currentPath, relativePath);

        DR.logger.verbose.info(`Copying ${relativePath}...`);
        await copy(sourcePath, destPath, { overwrite: true });
      } catch (fileError) {
        DR.logger.verbose.error(
          `Error copying file: ${ErrorUtils.getErrorString(fileError)}`
        );
      }
    }

    DR.logger.success(`Copied ${matchingFiles.length} files`);
  } catch (error) {
    DR.logger.error(
      `Failed to copy extra files: ${ErrorUtils.getErrorString(error)}`
    );
  }
}

/**
 * Lists all worktrees in a table format.
 */
export async function listWorktrees(): Promise<void> {
  try {
    const worktrees = await GitService.getWorktreesInfo();

    if (worktrees.length === 0) {
      DR.logger.info('No worktrees found');
      return;
    }

    // Format worktrees for console.table
    const tableData = worktrees.map((wt) => ({
      Status: wt.isMain ? 'Base' : 'Worktree',
      Branch: wt.branch || '(detached)',
      Commit: wt.commit.slice(0, 8),
      Path: wt.path
    }));

    console.log('\n');
    console.table(tableData);
  } catch (error) {
    DR.logger.error(
      `Failed to list worktrees: ${ErrorUtils.getErrorString(error)}`
    );
  }
}

/**
 * Removes a worktree using an interactive selection menu.
 */
export async function removeWorktree(): Promise<void> {
  try {
    const worktrees = await GitService.getWorktreesInfo();

    // Filter out main worktree - can't remove it
    const removableWorktrees = worktrees.filter((wt) => !wt.isMain);

    if (removableWorktrees.length === 0) {
      DR.logger.info('No worktrees to remove (only main worktree exists)');
      return;
    }

    // Create choices for the prompt
    const choices = removableWorktrees.map((wt) => ({
      name: `${wt.branch || '(detached)'} - ${wt.path}`,
      value: wt.path
    }));

    // Show interactive prompt
    const targetPath = await select({
      message: 'Select a worktree to remove:',
      choices
    });

    DR.logger.info(`Removing worktree at: ${targetPath}`);

    // Remove worktree (git will handle dirty check)
    await GitService.removeWorktree(targetPath);

    // Also remove the VS Code workspace storage for this worktree
    try {
      const wasDeleted = await VSCodeService.deleteWorkspaceByPath(targetPath);
      if (wasDeleted) {
        DR.logger.verbose.info('Removed VS Code workspace storage');
      }
    } catch (storageError) {
      DR.logger.verbose.warn(
        `Could not remove VS Code workspace storage: ${ErrorUtils.getErrorString(storageError)}`
      );
    }

    DR.logger.success(`Worktree removed: ${targetPath}`);
  } catch (error) {
    DR.logger.error(
      `Failed to remove worktree: ${ErrorUtils.getErrorString(error)}`
    );
  }
}
