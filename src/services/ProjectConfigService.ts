import builtInProjects, { Project } from '../config/projects.js';
import CurrentEnv from '../utils/CurrentEnv.js';
import GitService from './applications/GitService.js';
import { ConfigService } from './ConfigService.js';

/**
 * Service for managing project configurations, merging built-in projects
 * with user-defined configurations.
 */
export class ProjectConfigService {
  private static mergedProjects: Record<string, Project> | null = null;

  /**
   * Get all projects (built-in + user-configured).
   * User configurations will completely override built-in configurations for matching folder names.
   */
  static async getProjects(): Promise<Record<string, Project>> {
    if (this.mergedProjects) {
      return this.mergedProjects;
    }

    const userConfig = await ConfigService.loadConfig();
    const userProjects = userConfig.projects;

    // Merge in user projects (complete override for matching keys)
    return {
      ...builtInProjects,
      ...userProjects
    };
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
   *
   * @returns The project configuration, or undefined if not found
   */
  static async getCurrentProject(): Promise<Project | undefined> {
    const currentFolder = CurrentEnv.folderName();

    // First try direct match
    const project = await this.getProject(currentFolder);
    if (project) return project;

    // If not found, check if this is a worktree
    const mainProjectFolder = await GitService.getMainProjectFromWorktree();
    if (mainProjectFolder) {
      return await this.getProject(mainProjectFolder);
    }

    return undefined;
  }
}
