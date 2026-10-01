import { DR, ErrorUtils } from '@aneuhold/core-ts-lib';
import { checkbox, confirm } from '@inquirer/prompts';
import fs from 'fs-extra';
import ClaudeCodeService, {
  type ClaudeStorageItem
} from '../services/applications/ClaudeCode.service.js';
import CLIService from '../services/CLI.service.js';
import CurrentEnv, { OperatingSystemType } from '../utils/CurrentEnv.js';

/**
 * Different things that can be cleaned.
 */
enum CleanTarget {
  Branches = 'branches',
  ClaudeStorage = 'claude-storage'
}

/**
 * The main entry-point for the `clean` command.
 *
 * @param cleanTarget The target to clean.
 */
export default async function clean(cleanTarget?: string): Promise<void> {
  if (!cleanTarget) {
    DR.logger.error(
      `No target was specified. See below for a list of valid targets:`
    );
    logValidCleanTargets();
    return;
  }

  const normalizedTarget = cleanTarget.toLowerCase();

  if (!isCleanTarget(normalizedTarget)) {
    DR.logger.error(
      `The target "${normalizedTarget}" is not a valid target. See below ` +
        `for a list of valid targets:`
    );
    logValidCleanTargets();
    return;
  }

  switch (normalizedTarget) {
    case CleanTarget.Branches:
      await cleanBranches();
      break;
    case CleanTarget.ClaudeStorage:
      await cleanClaudeStorage();
      break;
  }
}

/**
 * Returns true if the given string is a valid {@link CleanTarget}.
 *
 * @param value the string to check
 */
function isCleanTarget(value: string): value is CleanTarget {
  const values: string[] = Object.values(CleanTarget);
  return values.includes(value);
}

/**
 * Removes all git branches besides the main branch locally.
 *
 * This currently throws an error on Windows because of the profile usage,
 * but it still works. It doesn't work without using the profile for some reason.
 */
async function cleanBranches() {
  DR.logger.success(
    `Removing all git branches besides the main branch locally...`
  );
  if (CurrentEnv.os === OperatingSystemType.Windows) {
    // Execute the powershell version of the command
    const returnValue = await CLIService.execCmd(
      `git branch -D  @(git branch | Select-String -NotMatch "main" | Foreach {$_.Line.Trim()})`,
      false,
      undefined,
      true
    );
    DR.logger.info(returnValue.output);
    return;
  }
  // Execute the bash version of the command
  const returnValue = await CLIService.execCmd(
    `git branch | grep -v "main" | xargs git branch -D`
  );
  DR.logger.info(returnValue.output);
}

/**
 * Prompts for which kinds of Claude Code storage to clean, then for which
 * items of each kind, and deletes the chosen items after a confirmation.
 */
async function cleanClaudeStorage() {
  const items = await ClaudeCodeService.listStorage();
  if (items.length === 0) {
    DR.logger.info('No Claude Code storage was found.');
    return;
  }

  const itemsByKind = Map.groupBy(items, ({ kind }) => kind);
  const selectedKinds = await checkbox({
    message: 'Select the kinds of storage to clean:',
    choices: [...itemsByKind].map(([kind, kindItems]) => ({
      name: `${kind} (${kindItems.length} items, ${ClaudeCodeService.formatTotalSizeOfStorageItems(kindItems)})`,
      value: kind
    }))
  });

  const selectedItems: ClaudeStorageItem[] = [];
  for (const kind of selectedKinds) {
    const kindItems = itemsByKind.get(kind) ?? [];
    selectedItems.push(
      ...(await checkbox({
        message: `Select the ${kind} items to delete:`,
        choices: kindItems.map((item) => ({
          name: ClaudeCodeService.formatClaudeStorageItem(item),
          value: item
        })),
        pageSize: 20
      }))
    );
  }

  if (selectedItems.length === 0) {
    DR.logger.info('No items selected.');
    return;
  }

  const shouldDelete = await confirm({
    message: `Delete ${selectedItems.length} items (${ClaudeCodeService.formatTotalSizeOfStorageItems(selectedItems)})?`,
    default: false
  });
  if (!shouldDelete) {
    return;
  }

  const deletedItems: ClaudeStorageItem[] = [];
  for (const item of selectedItems) {
    try {
      await Promise.all(item.paths.map((itemPath) => fs.remove(itemPath)));
      deletedItems.push(item);
    } catch (error) {
      DR.logger.error(
        `Failed to delete ${item.sessionId}: ${ErrorUtils.getErrorString(error)}`
      );
    }
  }

  DR.logger.success(
    `Deleted ${deletedItems.length} items, freeing ${ClaudeCodeService.formatTotalSizeOfStorageItems(deletedItems)}.`
  );
}

/**
 * Logs the valid clean targets to the console.
 */
function logValidCleanTargets() {
  Object.values(CleanTarget).forEach((printTarget) => {
    console.log(`- ${printTarget}\n`);
  });
}
