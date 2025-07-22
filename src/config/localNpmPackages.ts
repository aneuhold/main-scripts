/**
 * Configuration for local npm packages that can be used with the sub/unsub/dev commands.
 * Maps arbitrary package prefixes to their full package names.
 */
export type LocalNpmPackageConfig = {
  [packagePrefix: string]: string;
};

/**
 * Maps arbitrary package prefixes to their full npm package names for use with local-npm-registry.
 * The key can be any convenient prefix - it doesn't need to match folder names.
 */
const localNpmPackages: LocalNpmPackageConfig = {
  cc: '@predictiveindex/client-core',
  tap: '@predictiveindex/tapestry'
};

/**
 * Logs the available packages that can be subscribed to or unsubscribed from.
 */
export function logAvailablePackages(): void {
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

export default localNpmPackages;
