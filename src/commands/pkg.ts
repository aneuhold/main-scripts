import { DR, PackageService } from '@aneuhold/core-ts-lib';

export enum PackageAction {
  validateJsr = 'validateJsr',
  publishJsr = 'publishJsr',
  validateNpm = 'validateNpm'
}

/**
 * Performs a package action, such as validating or publishing a JSR package.
 *
 * @param packageAction The package action to perform.
 */
export default async function pkg(packageAction: string): Promise<void> {
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
      await validateJsr();
      break;
    case PackageAction.publishJsr:
      await publishJsr();
      break;
    case PackageAction.validateNpm:
      await validateNpm();
      break;
    default:
      break;
  }
}

/**
 * Validates the JSR package for publishing.
 */
async function validateJsr() {
  await PackageService.validateJsrPublish();
}

/**
 * Publishes the JSR package.
 */
async function publishJsr() {
  await PackageService.publishToJsr();
}

/**
 * Validates the npm package for publishing.
 */
async function validateNpm() {
  await PackageService.validateNpmPublish();
}
