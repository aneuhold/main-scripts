#!/usr/bin/env node --no-warnings

import { DR } from '@aneuhold/core-ts-lib';
import { program } from 'commander';
import clean from './commands/clean.js';
import dev from './commands/dev.js';
import downloadAndMergeVideos from './commands/downloadAndMergeVideos.js';
import downloadVideos from './commands/downloadVideos.js';
import fpull from './commands/fpull.js';
import mergeAllVideos from './commands/mergeAllVideos.js';
import mergeVideos from './commands/mergeVideos.js';
import open from './commands/open.js';
import pkg, { PackageOptions } from './commands/pkg.js';
import scaffold from './commands/scaffold.js';
import setup from './commands/setup.js';
import startup from './commands/startup.js';
import sub from './commands/sub.js';
import unsub from './commands/unsub.js';
import calculateProbabilities from './utils/calculator.js';
import { triggerUpdate } from './utils/updateIfNeeded.js';

program.name('tb');

program
  .option('-v, --verbose', 'run with verbose logging')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      DR.logger.verbose.info('Verbose logging enabled...');
    }
  });

program
  .command('test')
  .argument('[args...]')
  .description('Runs a test command to make sure the package is working')
  .action((args) => {
    DR.logger.info(`You entered the following args: ${JSON.stringify(args)}`);
    calculateProbabilities();
  });

program
  .command('update')
  .description('Forces an update for this package')
  .action(async () => {
    await triggerUpdate();
  });

program
  .command('fpull')
  .description('Runs git fetch -a and then git pull in the current directory')
  .action(async () => {
    await fpull();
  });

program
  .command('setup')
  .description(
    'Sets up the dev environment based on the name of the current directory'
  )
  .action(async () => {
    await setup();
  });

program
  .command('open')
  .description(
    'Opens up the relevant project in the correct editor according to the current directory,' +
      ' or the provided app with presets.'
  )
  .argument('[appName]', 'The name of the app to open if wanted')
  .argument('[methodName]', 'The method to call of the specified application')
  .action(async (appName: string, methodName: string) => {
    await open(appName, methodName);
  });

program
  .command('startup')
  .description(
    'Runs the startup script for the current system with no arguments'
  )
  .action(async () => {
    await startup();
  });

program
  .command('scaffold')
  .description('Scaffolds a project')
  .argument(
    '[projectType]',
    'The type of project to scaffold. To see options, run this' +
      ' command without arguments.'
  )
  .argument(
    '[projectName]',
    'The name of the project to start. This will be the root folder name.'
  )
  .option('-l, --list', 'List all available project types')
  .action(
    async (
      projectType: string,
      projectName: string,
      options: { list: boolean }
    ) => {
      await scaffold(projectType, projectName, options.list);
    }
  );

program
  .command('clean')
  .description('Cleans up the provided target, for example branches')
  .argument(
    '[target]',
    'The target to clean up. To see options, run this' +
      ' command without arguments.'
  )
  .action(async (target: string) => {
    await clean(target);
  });

program
  .command('downloadVideos')
  .description(
    'Downloads all videos from the videosToDownload.ts file to a folder in the current directory.'
  )
  .action(async () => {
    await downloadVideos(false);
  });

program
  .command('mergeVideos')
  .description(
    'Merges all videos in the provided folder into a single video called merged.mp4.'
  )
  .argument(
    '[pathToFolder]',
    'The path to the folder containing the videos to merge. Defaults to the current directory.'
  )
  .action(async (pathToFolder: string) => {
    await mergeVideos(pathToFolder);
  });

program
  .command('downloadAndMergeVideos')
  .description(
    'Downloads all videos from the videosToDownload.ts file to a folder in the current directory,' +
      ' then merges all videos in that folder into a single video called merged.mp4.'
  )
  .action(async () => {
    await downloadAndMergeVideos();
  });

program
  .command('mergeAllVideos')
  .description(
    'Merges all videos in folders in the current directory into a merged.mp4 file in each folder.'
  )
  .action(async () => {
    await mergeAllVideos();
  });

program
  .command('pkg')
  .description(
    'Performs actions related to package publishing. This is ' +
      'typically used inside a package.json file as one of the scripts.'
  )
  .argument(
    '[packageAction]',
    'The package action to perform. Supported actions are: validateJsr, publishJsr, validateNpm, publishNpm, testStringReplacement, prepare.'
  )
  .argument(
    '[versionType]',
    'For prepare action: version type (patch, minor, major). Defaults to patch if not specified.'
  )
  .option(
    '-a, --alternative-names <names...>',
    'Alternative package names to use for publishing/validation'
  )
  .option(
    '-o, --original-string <string>',
    'Original string for testStringReplacement action'
  )
  .option(
    '-n, --new-string <string>',
    'New string for testStringReplacement action'
  )
  .action(
    async (
      packageAction: string,
      versionType: string,
      options: PackageOptions
    ) => {
      await pkg(
        packageAction,
        versionType,
        options.alternativeNames,
        options.originalString,
        options.newString
      );
    }
  );

program
  .command('sub')
  .description(
    'Subscribes to a package using local-npm-registry for automatic updates during development'
  )
  .argument(
    '[packagePrefix]',
    'The package prefix to subscribe to (e.g., "client-core", "spa"). To see options, run this command without arguments.'
  )
  .action(async (packagePrefix: string) => {
    await sub(packagePrefix);
  });

program
  .command('unsub')
  .description(
    'Unsubscribes from a package using local-npm-registry and resets to original version'
  )
  .argument(
    '[packagePrefix]',
    'The package prefix to unsubscribe from (e.g., "client-core", "spa"). If not provided, unsubscribes from all packages.'
  )
  .action(async (packagePrefix: string) => {
    await unsub(packagePrefix);
  });

program
  .command('dev')
  .description(
    'Starts development mode with nodemon to watch for changes. Auto-detects the current project and runs in the first packageJsonPath directory.'
  )
  .action(async () => {
    await dev();
  });

// Run the thang
void (async () => {
  await program.parseAsync();
  process.exit();
})();
