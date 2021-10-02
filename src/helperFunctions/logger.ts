/**
 * Logs info to the console. Prepends `ℹ️` to each message.
 */
export function logInfo(msg: string): void {
  console.log(`ℹ️  ${msg}`);
}

/**
 * Logs a success message to the console. Prepends `✅` to each message.
 *
 * @param msg
 */
export function logSuccess(msg: string): void {
  console.log(`✅ ${msg}`);
}

/**
 * Logs a failure message to the console. Prepends `🔴` to each message.
 *
 * See {@link logError} for logging errors.
 *
 * This doesn't use a `console.error` entry. Just a `console.log` entry.
 * @param msg
 */
export function logFailure(msg: string): void {
  console.log(`🔴 ${msg}`);
}

/**
 * Logs an error message to the console. Only use this for errors that will
 * likely stop execution. Prepends `💀` to each message and uses `console.error`.
 *
 * See {@link logFailure} for logging simple failures.
 *
 * @param msg
 */
export function logError(msg: string): void {
  console.error(`💀 ${msg}`);
}
