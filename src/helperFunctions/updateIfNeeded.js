const { exec } = require("child_process");
const { name: PACKAGE_NAME } = require("../../package.json");

/**
 * Triggers an update of this package.
 */
function triggerUpdate() {
  exec(`~./startup.sh update`);
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
function updateIfNeeded(args) {
  // Need to check if the version has already been checked today
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
      triggerUpdate();
    } else {
      console.log("✅ Package is up to date. Continuing...");
    }
    // Silently continues if no update is needed.
  });
}

module.exports = {
  triggerUpdate,
  updateIfNeeded
};
