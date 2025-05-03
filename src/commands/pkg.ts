import { DR, PackageService } from '@aneuhold/core-ts-lib';

export enum PackageAction {
  validateJsr = 'validateJsr',
  publishJsr = 'publishJsr'
}

/**
 *
 * @param packageAction
 */
export default async function pkg(packageAction: string): Promise<void> {
  if (!(packageAction in PackageAction)) {
    DR.logger.failure(`The package action ${packageAction} is not supported.`);
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
    default:
      break;
  }
}

/**
 *
 */
async function validateJsr() {
  await PackageService.validateJsrPublish();
}

/**
 *
 */
async function publishJsr() {
  await PackageService.publishToJsr();
}
