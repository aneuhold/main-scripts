import { MiddlewareFunction } from 'yargs';
import Log from '../helperFunctions/Log';
import { updateIfNeeded } from '../helperFunctions/updateIfNeeded';

/**
 * Just checks if verbose logging is enabled and if it is, then it logs that info.
 * @param argv
 */
const checkVerboseLoggingMiddleware: MiddlewareFunction<unknown> = (argv) => {
  if (argv.verbose) {
    Log.verboseLoggingEnabled = true;
    Log.verbose.info('Verbose logging enabled...');
  }
};

/**
 * Executes the `updateIfNeeded` function syncrounously to be provided to
 * `yargs`
 * {@link https://github.com/yargs/yargs/blob/main/docs/api.md#middlewarecallbacks-applybeforevalidation middleware}.
 *
 * @param argv
 */
const updateIfNeededMiddleware: MiddlewareFunction<unknown> = async () => {
  await updateIfNeeded();
};

export { checkVerboseLoggingMiddleware, updateIfNeededMiddleware };
