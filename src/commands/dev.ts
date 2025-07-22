import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import localNpmPackages from '../config/localNpmPackages.js';
import projects from '../config/projects.js';
import CLIService from '../services/CLIService.js';

/**
 * Starts a development watch mode using nodemon and local-npm-registry.
 * This command will watch for file changes and automatically publish the package.
 *
 * @param packagePrefix The prefix of the package to start development mode for. If not provided, will try to detect the current project.
 */
export default async function dev(packagePrefix?: string): Promise<void> {
  let targetProject;
  let targetPackageName;

  if (!packagePrefix) {
    // Try to detect the current project based on the current directory
    const currentDir = path.basename(process.cwd());

    // Find a project that matches the current directory name
    targetProject = Object.values(projects).find(
      (project) => project.folderName === currentDir
    );

    if (!targetProject) {
      DR.logger.error(
        `Could not detect a project configuration for the current directory "${currentDir}". ` +
          'Please specify a package prefix or ensure you are in a configured project directory. ' +
          'See below for available options:'
      );
      logAvailablePackages();
      return;
    }

    // For auto-detection, we need the project to have nodemon args
    if (!targetProject.nodemonArgs || targetProject.nodemonArgs.length === 0) {
      DR.logger.error(
        `The current project "${targetProject.folderName}" does not have nodemon arguments configured for development mode.`
      );
      return;
    }

    DR.logger.info(`Auto-detected project: ${targetProject.folderName}`);
  } else {
    // Manual selection by package prefix
    const normalizedPrefix = packagePrefix.toLowerCase();

    // Get the package name from the localNpmPackages configuration
    targetPackageName = localNpmPackages[normalizedPrefix];
    if (!targetPackageName) {
      DR.logger.error(
        `The package prefix "${packagePrefix}" does not match any available packages. See below for available options:`
      );
      logAvailablePackages();
      return;
    }

    // Find the corresponding project by checking which project can be used for this package
    targetProject = Object.values(projects).find((project) => {
      return project.nodemonArgs && project.nodemonArgs.length > 0;
    });

    if (!targetProject) {
      DR.logger.error(
        'No project is configured with nodemon arguments for development mode.'
      );
      return;
    }
  }

  // Determine the working directory
  let workingDirectory = process.cwd();
  if (
    targetProject.packageJsonPaths &&
    targetProject.packageJsonPaths.length > 0
  ) {
    // Use the directory containing the first package.json
    const packageJsonPath = targetProject.packageJsonPaths[0];
    workingDirectory = path.resolve(
      workingDirectory,
      path.dirname(packageJsonPath)
    );
  }

  const displayName = targetPackageName || targetProject.folderName;
  DR.logger.info(`Starting development mode for "${displayName}"...`);
  DR.logger.info(`Working directory: ${workingDirectory}`);
  DR.logger.info('Press Ctrl+C to stop watching...');

  try {
    // Use spawnCmd for long-running nodemon process
    const args = targetProject.nodemonArgs;
    const { output, didComplete } = await CLIService.spawnCmd(
      'nodemon',
      args,
      workingDirectory
    );

    if (didComplete) {
      DR.logger.info('Development mode stopped.');
    } else {
      DR.logger.error('Development mode was interrupted.');
    }

    if (output.trim()) {
      console.log(output);
    }
  } catch (error) {
    DR.logger.error(`Error starting development mode: ${String(error)}`);
  }
}

/**
 * Logs the available packages that can be used for development.
 */
function logAvailablePackages() {
  // Show available package prefixes
  const availablePackages = Object.entries(localNpmPackages).map(
    ([prefix, packageName]) => `- ${prefix} (${packageName})`
  );

  // Also show projects that can be auto-detected
  const autoDetectableProjects = Object.values(projects)
    .filter((project) => project.nodemonArgs && project.nodemonArgs.length > 0)
    .map((project) => `- Auto-detectable: ${project.folderName}`);

  console.log('Available package prefixes:');
  availablePackages.forEach((packageInfo) => {
    console.log(packageInfo);
  });

  if (autoDetectableProjects.length > 0) {
    console.log('\nProjects that can be auto-detected (run dev without args):');
    autoDetectableProjects.forEach((project) => {
      console.log(project);
    });
  }
}
