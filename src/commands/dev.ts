import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import projects from '../config/projects.js';
import CLIService from '../services/CLIService.js';

/**
 * Starts a development watch mode using nodemon.
 * This command will watch for file changes and run the configured nodemon arguments.
 * It detects the current project and runs in the directory of the first packageJsonPath.
 */
export default async function dev(): Promise<void> {
  // Try to detect the current project based on the current directory
  const currentDir = path.basename(process.cwd());

  // Find a project that matches the current directory name
  const targetProject = Object.values(projects).find(
    (project) => project.folderName === currentDir
  );

  if (!targetProject) {
    DR.logger.error(
      `Could not detect a project configuration for the current directory "${currentDir}". ` +
        'Please ensure you are in a configured project directory. ' +
        'Available projects:'
    );
    logAvailableProjects();
    return;
  }

  // Check if the project has nodemon args configured
  if (
    !targetProject.nodemonArgs ||
    Object.keys(targetProject.nodemonArgs).length === 0
  ) {
    DR.logger.error(
      `The current project "${targetProject.folderName}" does not have nodemon arguments configured for development mode.`
    );
    return;
  }

  // Get the base working directory from the first packageJsonPath or current directory
  let baseWorkingDirectory = process.cwd();
  if (
    targetProject.packageJsonPaths &&
    targetProject.packageJsonPaths.length > 0
  ) {
    // Use the directory containing the first package.json
    const packageJsonPath = targetProject.packageJsonPaths[0];
    baseWorkingDirectory = path.resolve(
      baseWorkingDirectory,
      path.dirname(packageJsonPath)
    );
  }

  DR.logger.info(
    `Starting development mode for "${targetProject.folderName}"...`
  );

  // Run nodemon for each configured path
  const nodemonProcesses = Object.entries(targetProject.nodemonArgs).map(
    async ([relativePath, args], index) => {
      const workingDirectory = path.resolve(baseWorkingDirectory, relativePath);

      DR.logger.info(`[${index + 1}] Working directory: ${workingDirectory}`);
      DR.logger.info(`[${index + 1}] Running: nodemon ${args.join(' ')}`);

      try {
        const { output, didComplete } = await CLIService.spawnCmd(
          'nodemon',
          args,
          workingDirectory
        );

        if (didComplete) {
          DR.logger.info(`[${index + 1}] Development mode stopped.`);
        } else {
          DR.logger.error(`[${index + 1}] Development mode was interrupted.`);
        }

        if (output.trim()) {
          console.log(`[${index + 1}] ${output}`);
        }
      } catch (error) {
        DR.logger.error(
          `[${index + 1}] Error starting development mode: ${String(error)}`
        );
      }
    }
  );

  DR.logger.info('Press Ctrl+C to stop all watchers...');

  // Wait for all nodemon processes to complete
  await Promise.all(nodemonProcesses);
}

/**
 * Logs the available projects that can be used for development.
 */
function logAvailableProjects() {
  const availableProjects = Object.values(projects)
    .filter(
      (project) =>
        project.nodemonArgs && Object.keys(project.nodemonArgs).length > 0
    )
    .map((project) => `- ${project.folderName}`);

  if (availableProjects.length === 0) {
    console.log('No projects are configured for development mode.');
    return;
  }

  console.log('Projects configured for development:');
  availableProjects.forEach((project) => {
    console.log(project);
  });
}
