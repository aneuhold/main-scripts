/**
 * Inspects a thrown value against the set of errors that have a known, graceful
 * exit behavior. If the error is recognized, the process exits with the
 * appropriate code and this function never returns. Unrecognized errors are
 * re-thrown so they surface normally.
 *
 * As new errors become known, add a branch here so cancellation and shutdown
 * handling lives in one spot.
 *
 * @param error the value caught from a top-level try/catch
 */
const handleDefinedErrors = (error: unknown): never => {
  if (error instanceof Error) {
    // Inquirer throws an ExitPromptError when the user cancels a prompt with
    // Ctrl+C. Treat that as a clean cancellation instead of a crash.
    if (error.name === 'ExitPromptError') {
      process.exit(0);
    }
  }

  throw error;
};

export default handleDefinedErrors;
