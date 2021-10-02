#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { triggerUpdate } from './helperFunctions/updateIfNeeded';
import {
  updateIfNeededMiddleware,
  checkVerboseLoggingMiddleware,
} from './middleware/basicMiddleware';

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
    'Echos a test response to make sure the library is working',
    () => {},
    (argv) => {
      console.info(`You entered the following args :${JSON.stringify(argv)}`);
    }
  )
  .command(
    'update',
    'Forces an update for this package',
    () => {},
    (argv) => {
      console.log('Forcing update...');
      triggerUpdate(argv._ as string[]);
    }
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .help()
  .parse();
