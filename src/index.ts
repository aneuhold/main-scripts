#!/usr/bin/env node
import { Logger } from '@aneuhold/core-ts-lib';
import { program } from 'commander';
import clean from './commands/clean';
import fpull from './commands/fpull';
import open from './commands/open';
import scaffold from './commands/scaffold';
import setup from './commands/setup';
import startup from './commands/startup';
import calculateProbabilities from './helperFunctions/calculator';
import { triggerUpdate } from './helperFunctions/updateIfNeeded';

program.name('tb');

program
  .option('-v, --verbose', 'run with verbose logging')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      Logger.verboseLoggingEnabled = true;
      Logger.verbose.info('Verbose logging enabled...');
    }
  });

program
  .command('test')
  .argument('[args...]')
  .description('Runs a test command to make sure the package is working')
  .action(async (args) => {
    Logger.info(`You entered the following args: ${JSON.stringify(args)}`);
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
    'Sets up the dev environemnt based on the name of the current directory'
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
  .action(async (appName, methodName) => {
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
  .action(async (projectType, projectName, options) => {
    await scaffold(projectType, projectName, options.list);
  });

program
  .command('clean')
  .description('Cleans up the provided target, for example branches')
  .argument(
    '[target]',
    'The target to clean up. To see options, run this' +
      ' command without arguments.'
  )
  .action(async (target) => {
    await clean(target);
  });

// Run the thang
(async () => {
  await program.parseAsync();
  process.exit();
})();
