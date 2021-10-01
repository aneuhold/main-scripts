#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { updateIfNeeded, triggerUpdate } from "./helperFunctions/updateIfNeeded";

updateIfNeeded(process.argv);

/**
 * Sets up all of the top-level commands and their options
 */
yargs(hideBin(process.argv))
  .command(
    "test",
    "Echos a test response to make sure the library is working",
    () => {},
    (argv) => {
      console.info(`You entered the following args :${JSON.stringify(argv)}`);
    }
  )
  .command(
    "update",
    "Forces an update for this package",
    () => {},
    (argv) => {
      console.log("Forcing update...");
      triggerUpdate(argv._ as string[]);
    }
  )
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .help()
  .parse();
