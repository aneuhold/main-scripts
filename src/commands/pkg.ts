import { DR, PackageService, VersionType } from '@aneuhold/core-ts-lib';

export type PackageOptions = {
  alternativeNames?: string[];
  originalString?: string;
  newString?: string;
};

export enum PackageAction {
  validateJsr = 'validateJsr',
  publishJsr = 'publishJsr',
  validateNpm = 'validateNpm',
  publishNpm = 'publishNpm',
  testStringReplacement = 'testStringReplacement',
  prepare = 'prepare'
}

/**
 * Performs a package action, such as validating or publishing a JSR/npm package.
 *
 * @param packageAction The package action to perform.
 * @param versionType For prepare action: the type of version bump (patch, minor, major). For other actions, this can be used as a generic second argument.
 * @param alternativePackageNames Optional alternative package names to use.
 * @param originalString For testStringReplacement: the original string to replace.
 * @param newString For testStringReplacement: the new string to replace it with.
 */
export default async function pkg(
  packageAction: string,
  versionType?: string,
  alternativePackageNames?: string[],
  originalString?: string,
  newString?: string
): Promise<void> {
  if (!(packageAction in PackageAction)) {
    DR.logger.error(`The package action ${packageAction} is not supported.`);
    DR.logger.info(`The supported package actions are:`);
    Object.keys(PackageAction).forEach((name) => {
      console.log(`- ${name}\n`);
    });
    return;
  }

  switch (packageAction as PackageAction) {
    case PackageAction.validateJsr:
      await validateJsr(alternativePackageNames);
      break;
    case PackageAction.publishJsr:
      await publishJsr(alternativePackageNames);
      break;
    case PackageAction.validateNpm:
      await validateNpm(alternativePackageNames);
      break;
    case PackageAction.publishNpm:
      await publishNpm(alternativePackageNames);
      break;
    case PackageAction.testStringReplacement:
      await testStringReplacement(originalString, newString);
      break;
    case PackageAction.prepare:
      await prepare(versionType);
      break;
    default:
      break;
  }
}

/**
 * Validates the JSR package for publishing.
 *
 * @param alternativePackageNames Optional alternative package names to validate.
 */
async function validateJsr(alternativePackageNames?: string[]) {
  await PackageService.validateJsrPublish(alternativePackageNames);
}

/**
 * Publishes the JSR package.
 *
 * @param alternativePackageNames Optional alternative package names to publish.
 */
async function publishJsr(alternativePackageNames?: string[]) {
  await PackageService.publishToJsr(alternativePackageNames);
}

/**
 * Validates the npm package for publishing.
 *
 * @param alternativePackageNames Optional alternative package names to validate.
 */
async function validateNpm(alternativePackageNames?: string[]) {
  await PackageService.validateNpmPublish(alternativePackageNames);
}

/**
 * Publishes the npm package.
 *
 * @param alternativePackageNames Optional alternative package names to publish.
 */
async function publishNpm(alternativePackageNames?: string[]) {
  await PackageService.publishToNpm(alternativePackageNames);
}

/**
 * Tests string replacement functionality.
 *
 * @param originalString The original string to replace.
 * @param newString The new string to replace it with.
 */
async function testStringReplacement(
  originalString?: string,
  newString?: string
) {
  if (!originalString || !newString) {
    DR.logger.error(
      'Both originalString and newString are required for testStringReplacement.'
    );
    return;
  }
  await PackageService.testStringReplacement(originalString, newString);
}

/**
 * Prepares the package by bumping the version if needed and initializing changelog.
 *
 * @param versionType The type of version bump (patch, minor, major). Defaults to patch.
 */
async function prepare(versionType?: string) {
  const validVersionTypes = ['patch', 'minor', 'major'];
  let parsedVersionType: VersionType | undefined;

  if (versionType) {
    if (!validVersionTypes.includes(versionType)) {
      DR.logger.error(
        `Invalid version type: ${versionType}. Valid types are: ${validVersionTypes.join(', ')}`
      );
      return;
    }
    parsedVersionType = versionType as VersionType;
  }

  await PackageService.bumpVersionIfNeededAndInitializeChangelog(
    parsedVersionType
  );
}
