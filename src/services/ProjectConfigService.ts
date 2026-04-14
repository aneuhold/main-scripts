import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import CurrentEnv, { TerminalType } from '../utils/CurrentEnv.js';
import GitService from './applications/GitService.js';
import ITermService from './applications/ITermService.js';
import CLIService from './CLIService.js';
import { ConfigService, MainScriptsConfigProject } from './ConfigService.js';

/**
 * A resolved project configuration, including the dynamically generated
 * `setup` function derived from the user's `setupConfig` block.
 */
export type Project = MainScriptsConfigProject & {
  setup?: () => Promise<void>;
};

/**
 * Service for loading project configurations from user config.
 */
export class ProjectConfigService {
  private static mergedProjects: Record<string, Project> | null = null;

  /**
   * Get all user-configured projects, keyed by folder name. Each project has
   * a generated `setup` function if its `setupConfig` block is actionable.
   */
  static async getProjects(): Promise<Record<string, Project>> {
    if (this.mergedProjects) {
      return this.mergedProjects;
    }

    const userConfig = await ConfigService.loadConfig();
    const projects: Record<string, Project> = {
      ...(userConfig.projects ?? {})
    };

    for (const project of Object.values(projects)) {
      const generatedSetup = this.buildSetupFromConfig(project);
      if (generatedSetup) {
        project.setup = generatedSetup;
      }
    }

    return projects;
  }

  /**
   * Get a specific project by folder name.
   *
   * @param folderName The name of the folder/project to retrieve
   */
  static async getProject(folderName: string): Promise<Project | undefined> {
    const projects = await this.getProjects();
    return projects[folderName];
  }

  /**
   * Get the project configuration for the current directory, checking both
   * direct folder name match and worktree association.
   */
  static async getCurrentProject(): Promise<Project | undefined> {
    const currentFolder = CurrentEnv.folderName();

    const project = await this.getProject(currentFolder);
    if (project) return project;

    const mainProjectFolder = await GitService.getMainProjectFromWorktree();
    if (mainProjectFolder) {
      return await this.getProject(mainProjectFolder);
    }

    return undefined;
  }

  /**
   * Builds a `setup` function from a project's `setupConfig` block. Returns
   * `undefined` when the block has no actionable fields.
   *
   * @param project The project config to build the setup function for.
   */
  private static buildSetupFromConfig(
    project: Project
  ): (() => Promise<void>) | undefined {
    const setupConfig = project.setupConfig;
    const hasInstall = !!setupConfig?.installCommand;
    const splitCommands = setupConfig?.newTabVerticalSplitCommands ?? [];
    const hasSplitCommands = splitCommands.length > 0;
    if (!setupConfig || (!hasInstall && !hasSplitCommands)) {
      return undefined;
    }

    return async () => {
      DR.logger.info(`Setting up ${project.folderName}...`);
      const currentPath = path.resolve('.');

      if (hasSplitCommands && CurrentEnv.terminal() !== TerminalType.ITerm2) {
        DR.logger.error(
          `setupConfig.newTabVerticalSplitCommands is only supported in iTerm2.`
        );
        return;
      }

      if (hasInstall && setupConfig.installCommand) {
        DR.logger.info(
          `Running install command: ${setupConfig.installCommand}`
        );
        const { output } = await CLIService.execCmd(
          setupConfig.installCommand,
          false,
          currentPath
        );
        console.log(output);
      }

      if (hasSplitCommands) {
        await ITermService.openNewTabSplitVerticallyAndRunCommand(
          splitCommands.join(' && '),
          currentPath
        );
      }
    };
  }
}
