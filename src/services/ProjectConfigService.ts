import builtInProjects, { Project } from '../config/projects.js';
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
}
