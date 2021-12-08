#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { triggerUpdate } from './helperFunctions/updateIfNeeded';
import {
  updateIfNeededMiddleware,
  checkVerboseLoggingMiddleware,
} from './middleware/basicMiddleware';
import fpull from './commands/fpull';
import setup from './commands/setup';
import open from './commands/open';
import startup from './commands/startup';
import execCmd from './helperFunctions/cmd';
import scaffold from './commands/scaffold';

/**
 * Sets up all of the top-level commands and their options. This is the entry
 * point for the WHOLE SHE-BANG.
 */
yargs(hideBin(process.argv))
  // If a promise is returned in the middleware, then it will wait until
  // that promise resolves to continue.
  .middleware([checkVerboseLoggingMiddleware, updateIfNeededMiddleware], true)
  .command(
    'test',
    'Echos your arguments to make sure the library is working',
    {},
    (argv) => {
      console.info(`You entered the following args: ${JSON.stringify(argv._)}`);
      console.log(process.env);
      execCmd({ command: 'ls' });
    }
  )
  .command('update', 'Forces an update for this package', {}, () => {
    console.log('Forcing update...');
    triggerUpdate();
  })
  .command(
    'fpull',
    'Runs git fetch -a and then git pull in the current directory',
    {},
    () => {
      fpull();
    }
  )
  .command(
    'setup',
    'Sets up the dev environemnt based on the name of the current directory',
    {},
    () => {
      setup();
    }
  )
  .command(
    'open',
    'Opens up the relevant project in the correct editor according to the current directory',
    {},
    async () => {
      await open();
      process.exit();
    }
  )
  .command(
    'startup',
    'Runs the startup script for the current system with no arguments',
    {},
    () => {
      startup();
    }
  )
  .command(
    'scaffold [projectType] [projectName]',
    'Scaffolds a project',
    (yargsInstance) => {
      return yargsInstance
        .positional('projectType', {
          describe:
            'The type of project to scaffold. To see options, run this' +
            ' command without arguments.',
        })
        .positional('projectName', {
          describe:
            'The name of the project to start. This will be the root' +
            ' folder name.',
        });
    },
    (argv) => {
      scaffold(
        argv.projectType as undefined | string,
        argv.projectName as undefined | string
      );
    }
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .help()
  .scriptName('tb')
  .parse();
