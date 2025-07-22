import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import localNpmPackages from '../config/localNpmPackages.js';
import projects from '../config/projects.js';
import CLIService from '../services/CLIService.js';

/**
 * Subscribes to a package using local-npm-registry.
 *
 * @param packagePrefix The prefix of the package to subscribe to (e.g., 'client-core' for '@company/client-core')
 */
export default async function sub(packagePrefix?: string): Promise<void> {
  if (!packagePrefix) {
    DR.logger.error(
      'No package prefix was specified. See below for available options:'
    );
    logAvailablePackages();
    return;
  }

  // Normalize the package prefix
  const normalizedPrefix = packagePrefix.toLowerCase();

  // Get the package name from the localNpmPackages configuration
  const packageName = localNpmPackages[normalizedPrefix];
  if (!packageName) {
    DR.logger.error(
      `The package prefix "${packagePrefix}" does not match any available packages. See below for available options:`
    );
    logAvailablePackages();
    return;
  }

  // Find the project that matches the current directory
  const currentDir = path.basename(process.cwd());
  const matchingProject = Object.values(projects).find(
    (project) => project.folderName === currentDir
  );

  let workingDirectories: string[] = [];

  if (
    matchingProject &&
    matchingProject.packageJsonPaths &&
    matchingProject.packageJsonPaths.length > 0
  ) {
    // Use all directories containing package.json files
    workingDirectories = matchingProject.packageJsonPaths.map(
      (packageJsonPath) =>
        path.resolve(process.cwd(), path.dirname(packageJsonPath))
    );
  } else {
    // Default to current directory
    workingDirectories = [process.cwd()];
  }

  DR.logger.info(`Subscribing to package "${packageName}"...`);
  DR.logger.info(`Running in ${workingDirectories.length} directory(ies)`);

  // Run subscription in all working directories
  const results = await Promise.allSettled(
    workingDirectories.map(async (workingDirectory, index) => {
      DR.logger.info(
        `[${index + 1}/${workingDirectories.length}] Running in: ${workingDirectory}`
      );

      const { output, didComplete } = await CLIService.execCmd(
        `local-npm subscribe ${packageName}`,
        true,
        workingDirectory
      );

      return { workingDirectory, output, didComplete };
    })
  );

  // Process results
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { workingDirectory, output, didComplete } = result.value;

      if (didComplete) {
        successCount++;
        DR.logger.success(
          `[${index + 1}] Successfully subscribed in ${path.basename(workingDirectory)}`
        );
      } else {
        failureCount++;
        DR.logger.error(
          `[${index + 1}] Failed to subscribe in ${path.basename(workingDirectory)}`
        );
      }

      if (output.trim()) {
        console.log(`Output from ${path.basename(workingDirectory)}:`);
        console.log(output);
      }
    } else {
      failureCount++;
      DR.logger.error(
        `[${index + 1}] Error in ${path.basename(workingDirectories[index])}: ${String(result.reason)}`
      );
    }
  });

  // Summary
  if (successCount > 0) {
    DR.logger.success(
      `Successfully subscribed to ${packageName} in ${successCount} location(s)`
    );
  }
  if (failureCount > 0) {
    DR.logger.error(`Failed to subscribe in ${failureCount} location(s)`);
  }
}

/**
 * Logs the available packages that can be subscribed to.
 */
function logAvailablePackages() {
  const availablePackages = Object.entries(localNpmPackages).map(
    ([prefix, packageName]) => `- ${prefix} (${packageName})`
  );

  if (availablePackages.length === 0) {
    console.log('No projects are configured for package subscription.');
    return;
  }

  console.log('Available packages:');
  availablePackages.forEach((packageInfo) => {
    console.log(packageInfo);
  });
}
