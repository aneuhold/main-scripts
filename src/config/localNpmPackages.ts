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

export default localNpmPackages;
