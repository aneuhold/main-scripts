/* This file is meant to house helper functions for specifically executing
command line / terminal things. */

import { exec as normalExec } from 'child_process';
import util from 'util';

/**
 * The promisified version of the {@link normalExec} function.
 */
const exec = util.promisify(normalExec);

/**
 * Executes the given command in a shell environment. Spins up a separate
 * process to execute the command and returns a promise once it is completely
 * finished.
 *
 * Errors while executing the command are printed to the console.
 *
 * @param cmd the command to run
 * @param verboseLoggingEnabled if set to true, will log the output from the command.
 * Either way, if there is an error, it will still output the error.
 *
 * @returns an object that holds the output and the true if the command comlpleted
 * successfully or false if it did not
 */
export default async function execCmd(
  cmd: string,
  verboseLoggingEnabled?: boolean
): Promise<{ didComplete: boolean; output: string }> {
  try {
    const { stdout, stderr } = await exec(cmd);
    if (stderr) {
      console.error(`💀 There was an error executing ${cmd}. Details are printed below:
      ${stderr}`);
      return {
        didComplete: false,
        output: stderr,
      };
    }
    if (verboseLoggingEnabled) {
      console.log(stdout);
    }
    return {
      didComplete: true,
      output: stdout,
    };
  } catch (err) {
    console.error(`💀 There was an error executing the "exec" function. Details are printed below:
    ${err}`);
    return {
      didComplete: true,
      output: err,
    };
  }
}
