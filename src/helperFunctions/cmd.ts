/* This file is meant to house helper functions for specifically executing
command line / terminal things. */

import { exec as normalExec, ExecOptions } from 'child_process';
import util from 'util';
import CurrentEnv, { OperatingSystemType } from './CurrentEnv';
import Log from './logger';

/**
 * The promisified version of the {@link normalExec} function.
 */
const exec = util.promisify(normalExec);

export const variousCommands = {
  pwshExectuablePath:
    'Get-Command pwsh | Select-Object -ExpandProperty Definition',
};

/**
 * Executes the given command in a shell environment. Spins up a separate
 * process to execute the command and returns a promise once it is completely
 * finished.
 *
 * The shell environment chosen is determiend by the `CurrentEnv` class.
 *
 * Errors while executing the command are printed to the console.
 *
 * @param cmd the command to run
 * @param logError if set to false, it will not output a log if an error
 * occurs in `stderr` when executing the function. This can be useful if
 * a command regularly outputs an error even when it succeeds.
 *
 * @returns an object that holds the output and the true if the command comlpleted
 * successfully or false if it did not
 */
export default async function execCmd(
  cmd: string,
  logError = false
): Promise<{ didComplete: boolean; output: string }> {
  const execOptions: ExecOptions = {};

  // Use powershell core if it is windows
  if (CurrentEnv.os() === OperatingSystemType.Windows) {
    execOptions.shell = 'pwsh';
  }

  try {
    const { stdout, stderr } = await exec(cmd, execOptions);
    if (stderr) {
      if (logError) {
        Log.error(`There was an error executing ${cmd}. Details are printed below:
        ${stderr}`);
      }
      return {
        didComplete: false,
        output: stderr,
      };
    }
    Log.verbose.info(stdout);
    return {
      didComplete: true,
      output: stdout,
    };
  } catch (err) {
    Log.error(`There was an error executing the "exec" function. Details are printed below:
    ${err}`);
    return {
      didComplete: false,
      output: err as string,
    };
  }
}
