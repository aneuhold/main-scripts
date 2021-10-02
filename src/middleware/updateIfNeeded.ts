import { MiddlewareFunction } from 'yargs';
import { updateIfNeeded } from '../helperFunctions/updateIfNeeded';

/**
 * Executes the `updateIfNeeded` function syncrounously to be provided to
 * `yargs`
 * {@link https://github.com/yargs/yargs/blob/main/docs/api.md#middlewarecallbacks-applybeforevalidation middleware}.
 *
 * @param argv
 */
const updateIfNeededMiddleware: MiddlewareFunction<unknown> = (argv) => {
  if (argv.verbose) {
    console.log('ℹ️  Verbose logging enabled...');
  }
  (async () => {
    await updateIfNeeded(argv._ as string[], !!argv.verbose);
  })();
};

export default updateIfNeededMiddleware;
