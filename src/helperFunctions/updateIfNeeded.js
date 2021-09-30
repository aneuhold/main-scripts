/**
 * Checks if an update is needed for this package. If there is, then it updates
 * and passes in the arguments so that it can be called again once the update
 * is finsihed.
 *
 * @param {string[]} args the arguments provided by the user
 */
function updateIfNeeded(args) {
  console.log(args);
}

module.exports = updateIfNeeded;
