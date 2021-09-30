const { exec } = require("child_process");
const { name: PACKAGE_NAME } = require("../../package.json");

/**
 * Triggers an update of this package.
 */
function triggerUpdate() {
  exec(`npm update -g ${PACKAGE_NAME}`);
}

/**
 * Checks if an update is needed for this package. If there is, then it updates
 * and passes in the arguments so that it can be called again once the update
 * is finished.
 *
 * This runs silently if no update is needed and there are no errors.
 *
 * @param {string[]} args the arguments provided by the user
 */
function updateIfNeeded(args) {
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
    console.log(`Your args were ${args}`);

    const updateIsNeeded = stdout.length !== 0;
    if (updateIsNeeded) {
      console.log("🔴 Update is needed. Installing update now...");
      triggerUpdate();
    }
    // Silently continues if no update is needed.
  });
}

module.exports = updateIfNeeded;
