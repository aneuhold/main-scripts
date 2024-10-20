export enum SemanticVersion {
  major = 'major',
  minor = 'minor',
  patch = 'patch'
}

/**
 * The main entry-point for the `bump` command. This will bump the version
 * field of the different package.json / similar files in the project.
 */
export default async function bump(
  cleanTarget: SemanticVersion = SemanticVersion.patch
): Promise<void> {}
