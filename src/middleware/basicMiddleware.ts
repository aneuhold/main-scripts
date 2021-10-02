import { MiddlewareFunction } from 'yargs';
import { logInfo } from '../helperFunctions/logger';
import { updateIfNeeded } from '../helperFunctions/updateIfNeeded';

/**
 * Just checks if verbose logging is enabled and if it is, then it logs that info.
 * @param argv
 */
const checkVerboseLoggingMiddleware: MiddlewareFunction<unknown> = (argv) => {
  if (argv.verbose) {
    logInfo('Verbose logging enabled...');
  }
};

/**
 * Executes the `updateIfNeeded` function syncrounously to be provided to
 * `yargs`
 * {@link https://github.com/yargs/yargs/blob/main/docs/api.md#middlewarecallbacks-applybeforevalidation middleware}.
 *
 * @param argv
 */
const updateIfNeededMiddleware: MiddlewareFunction<unknown> = async (argv) => {
  await updateIfNeeded(argv._ as string[], !!argv.verbose);
};

export { checkVerboseLoggingMiddleware, updateIfNeededMiddleware };
