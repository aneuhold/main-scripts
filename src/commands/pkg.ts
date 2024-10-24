import { Logger, PackageService } from '@aneuhold/core-ts-lib';

export enum PackageAction {
  validateJsr = 'validateJsr',
  publishJsr = 'publishJsr'
}

export default async function pkg(packageAction: string): Promise<void> {
  if (!(packageAction in PackageAction)) {
    Logger.failure(`The package action ${packageAction} is not supported.`);
    Logger.info(`The supported package actions are:`);
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

async function validateJsr() {
  await PackageService.validateJsrPublish();
}

async function publishJsr() {
  await PackageService.publishToJsr();
}
