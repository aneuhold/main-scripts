/* This file is meant to house helper functions for specifically executing
command line / terminal things. */

import { exec as normalExec, ExecOptions, spawn } from 'child_process';
import util from 'util';
import { checkVerboseLoggingMiddleware } from '../middleware/basicMiddleware';
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

type ExecCmdReturnType = { didComplete: boolean; output: string };

async function helperExec(
  cmd: string,
  execOptions: ExecOptions,
  logError: boolean
): Promise<ExecCmdReturnType> {
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

/**
 * Code was found from this site: https://stackabuse.com/executing-shell-commands-with-node-js/.
 *
 * This still needs to be hardened it feels like.
 *
 * @param cmd
 * @param execOptions
 */
async function helperSpawn(
  cmd: string,
  args: string[],
  execOptions: ExecOptions
): Promise<ExecCmdReturnType> {
  return new Promise((resolve) => {
    let output = '';
    const spawnedCmd = spawn(cmd, args, execOptions);

    spawnedCmd.on('error', (err) => {
      Log.error(`There was an error executing the "spawn" function. Details are printed below:
      ${err}`);
      resolve({
        didComplete: false,
        output: err.toString(),
      });
    });
    spawnedCmd.stdout.on('data', (data) => {
      output += data;
      // Trim so that the new lines don't go through
      Log.info(data.trim());
    });
    spawnedCmd.stderr.on('data', (data) => {
      output += data;
      // Trim so that the new lines don't go through
      Log.info(data.trim());
    });
    spawnedCmd.on('close', (exitCode) => {
      Log.info(`Command "${cmd}" exited with code ${exitCode}`);
      resolve({
        didComplete: true,
        output,
      });
    });
  });
}

/**
 * Executes the given command in a shell environment. Spins up a separate
 * process to execute the command and returns a promise once it is completely
 * finished.
 *
 * The shell environment chosen is determiend by the `CurrentEnv` class.
 *
 * @param cmd the command to run as either one large string or an object.
 *
 * If just a string is provided, this is ran as a normal execution where the
 * output is all returned at once after completion. For example this could be
 * `ls -a`
 *
 * If an object is provided, this is ran as a stream where all output is streamed
 * to the console. This is helpful for long-running commands or commands
 * that output a lot of data. For example `yarn` or `npm install`.
 * All of the output from this is logged by default because of the listeners
 * involved. This could be changed in the future though. For example the param
 * could be `{command: "npm", args: ["install"]}`
 *
 * @param logError if set to false, it will not output a log if an error
 * occurs in `stderr` when executing the function. This can be useful if
 * a command regularly outputs an error even when it succeeds. This  only
 * applies to commands ran with normal execution.
 *
 * @returns an object that holds the output and the true if the command comlpleted
 * successfully or false if it did not
 */
export default async function execCmd(
  cmd: string | { command: string; args: string[] },
  logError = false
): Promise<ExecCmdReturnType> {
  const execOptions: ExecOptions = {};

  // Use powershell core if it is windows
  if (CurrentEnv.os() === OperatingSystemType.Windows) {
    execOptions.shell = 'pwsh';
  }

  if (typeof cmd === 'string') {
    Log.verbose.info(
      'Command type provided to "execCmd" was a string, so executing "exec" promise...'
    );
    return helperExec(cmd, execOptions, logError);
  }
  Log.verbose.info(
    'Command type provided to "execCmd" was an object, so executing "spawn" promise...'
  );
  return helperSpawn(cmd.command, cmd.args, execOptions);
}
