import { exec } from "child_process";
import { name as PACKAGE_NAME } from "../../package.json";
import Store from "../Store";
import datesAreOnSameDay from "./dateFunctions";

async function hasAlreadyBeenUpdatedToday(): Promise<boolean> {
  const lastCheckDate = await Store.getLastCheckedDate();
  if (!lastCheckDate) {
    await Store.set("lastUpdateCheckDate", new Date());
    return false;
  }
  if (datesAreOnSameDay(lastCheckDate, new Date())) {
    return true;
  }
  return false;
}

function convertArgsToString(args: string[]): string {
  // Remove first two because those are not the actual args
  const argsThatMatter = args.splice(0, 2);
  // Join on a space
  return argsThatMatter.join(" ");
}

/**
 * Triggers an update of this package.
 */
export async function triggerUpdate(args: string[]): Promise<void> {
  console.log("Executing forced update...");
  exec(
    `~/startup.sh update mainscripts ${convertArgsToString(args)}`,
    (err, stdout, stderr) => {
      if (err) {
        console.log(
          `💀 There was an error executing the "exec" function: ${err.message}`
        );
        return;
      }
      if (stderr) {
        console.log(
          `💀 There was an error executing the forced update: ${stderr}`
        );
        return;
      }
      console.log(stdout);
    }
  );
}

/**
 * Checks if an update is needed for this package. If there is, then it updates
 * and passes in the arguments so that it can be called again once the update
 * is finished.
 *
 * Because the check for an update process is a bit long-winded, it only does
 * this once a day.
 *
 * @param {string[]} args the arguments provided by the user
 */
export async function updateIfNeeded(args: string[]): Promise<void> {
  // Check if the check has already happened today
  if (await hasAlreadyBeenUpdatedToday()) {
    return;
  }
  exec(`npm outdated -g ${PACKAGE_NAME}`, (err, stdout, stderr) => {
    if (err) {
      console.log(
        `💀 There was an error executing the "exec" function: ${err.message}`
      );
      return;
    }
    if (stderr) {
      console.log(
        `💀 There was an error checking if the package is outdated: ${stderr}`
      );
      return;
    }
    const updateIsNeeded = stdout.length !== 0;
    if (updateIsNeeded) {
      console.log("🔴 Update is needed. Installing update now...");
      triggerUpdate(args);
    } else {
      console.log("✅ Package is up to date. Continuing...");
    }
    // Silently continues if no update is needed.
  });
}
