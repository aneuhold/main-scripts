import { DR, PackageService } from '@aneuhold/core-ts-lib';

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
  testStringReplacement = 'testStringReplacement'
}

/**
 * Performs a package action, such as validating or publishing a JSR/npm package.
 *
 * @param packageAction The package action to perform.
 * @param alternativePackageNames Optional alternative package names to use.
 * @param originalString For testStringReplacement: the original string to replace.
 * @param newString For testStringReplacement: the new string to replace it with.
 */
export default async function pkg(
  packageAction: string,
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
