import { DR } from '@aneuhold/core-ts-lib';
import ClaudeCodeService, {
  ClaudeStorageKind
} from '../services/applications/ClaudeCode.service.js';
import ShellService from '../services/applications/Shell.service.js';
import CLIService from '../services/CLI.service.js';
import TextFormattingService from '../services/TextFormatting.service.js';
import CurrentEnv from '../utils/CurrentEnv.js';

/**
 * Different things that can be shown.
 */
enum ShowTarget {
  ShellMemUsage = 'shell-mem-usage',
  ClaudeStorage = 'claude-storage'
}

/**
 * Returns true if the given string is a valid {@link ShowTarget}.
 *
 * @param value the string to check
 */
function isShowTarget(value: string): value is ShowTarget {
  const values: string[] = Object.values(ShowTarget);
  return values.includes(value);
}

/**
 * The main entry-point for the `show` command.
 *
 * @param target the target to show
 */
export default async function show(target?: string): Promise<void> {
  const selected =
    target ??
    (await CLIService.selectFromList(
      Object.values(ShowTarget),
      'Select what to show',
      true
    ));

  if (!isShowTarget(selected)) {
    const availableTargets = Object.values(ShowTarget).join(', ');
    DR.logger.error(
      `Unknown target "${selected}". Available targets: ${availableTargets}`
    );
    return;
  }

  switch (selected) {
    case ShowTarget.ShellMemUsage:
      await showShellMemUsage();
      break;
    case ShowTarget.ClaudeStorage:
      await showClaudeStorage();
      break;
  }
}

/**
 * Prints how much memory the interactive shell sessions hold, grouped by the
 * directory each session sits in.
 */
async function showShellMemUsage(): Promise<void> {
  const sessions = await ShellService.getInteractiveShellsProcessInfo();

  if (sessions.length === 0) {
    DR.logger.info('No interactive shell sessions were found.');
    return;
  }

  const totalBytes = sessions.reduce(
    (total, { memoryBytes }) => total + memoryBytes,
    0
  );

  console.log('\n');
  console.table(
    groupShellProcessesByDirectory(sessions).map(
      ({ directory, memoryBytes, shellCount }) => ({
        Directory: directory,
        Memory: TextFormattingService.formatBytes(memoryBytes),
        Shells: shellCount
      })
    )
  );
  DR.logger.info(
    `${sessions.length} shell sessions holding ${TextFormattingService.formatBytes(totalBytes)}.`
  );
}

/**
 * Prints how much disk space Claude Code holds, totaled per kind and then
 * grouped by project and kind.
 */
async function showClaudeStorage(): Promise<void> {
  const items = await ClaudeCodeService.listStorage();

  if (items.length === 0) {
    DR.logger.info('No Claude Code storage was found.');
    return;
  }

  const totalsByGroup = new Map<
    string,
    {
      projectKey: string;
      kind: ClaudeStorageKind;
      count: number;
      sizeBytes: number;
    }
  >();
  for (const { projectKey, kind, sizeBytes } of items) {
    const groupKey = `${projectKey}/${kind}`;
    const existingTotal = totalsByGroup.get(groupKey);
    if (existingTotal) {
      existingTotal.count += 1;
      existingTotal.sizeBytes += sizeBytes;
    } else {
      totalsByGroup.set(groupKey, { projectKey, kind, count: 1, sizeBytes });
    }
  }
  const groupTotals = [...totalsByGroup.values()].sort(
    (a, b) => b.sizeBytes - a.sizeBytes
  );

  console.log('\n');
  console.table(
    Object.values(ClaudeStorageKind).map((kind) => {
      const kindItems = items.filter((item) => item.kind === kind);
      return {
        Kind: kind,
        Items: kindItems.length,
        Size: ClaudeCodeService.formatTotalSizeOfStorageItems(kindItems)
      };
    })
  );
  console.table(
    groupTotals.map(({ projectKey, kind, count, sizeBytes }) => ({
      Project: projectKey
        ? ClaudeCodeService.formatProjectKey(projectKey)
        : '-',
      Kind: kind,
      Items: count,
      Size: TextFormattingService.formatBytes(sizeBytes)
    }))
  );
  DR.logger.info(
    `${items.length} Claude Code storage items holding ${ClaudeCodeService.formatTotalSizeOfStorageItems(items)}.`
  );
}

/**
 * Groups the given sessions by the directory they sit in, heaviest first.
 *
 * @param shellProcesses the sessions to group
 */
function groupShellProcessesByDirectory(
  shellProcesses: { cwd: string; memoryBytes: number }[]
) {
  const usageByDirectory = new Map<
    string,
    {
      directory: string;
      memoryBytes: number;
      shellCount: number;
    }
  >();

  for (const { cwd, memoryBytes } of shellProcesses) {
    const directory = cwd
      ? CurrentEnv.shortenPathWithHomeDirectory(cwd)
      : '(unknown)';
    const existingUsage = usageByDirectory.get(directory);
    if (existingUsage) {
      existingUsage.memoryBytes += memoryBytes;
      existingUsage.shellCount += 1;
    } else {
      usageByDirectory.set(directory, {
        directory,
        memoryBytes,
        shellCount: 1
      });
    }
  }

  return [...usageByDirectory.values()].sort(
    (a, b) => b.memoryBytes - a.memoryBytes
  );
}
