#!/usr/bin/env node
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const updateIfNeeded = require("./helperFunctions/updateIfNeeded");

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
      console.info(`You entered? :${JSON.stringify(argv)}`);
    }
  )
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .help()
  .parse();
