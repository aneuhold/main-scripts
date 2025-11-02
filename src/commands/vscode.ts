import { DR } from '@aneuhold/core-ts-lib';
import { checkbox } from '@inquirer/prompts';
import VSCodeService from '../services/applications/VSCodeService.js';

/**
 * Lists all VS Code workspace storage directories.
 */
export async function listWorkspaces(): Promise<void> {
  const workspaces = await VSCodeService.listWorkspaces();

  if (workspaces.length === 0) {
    DR.logger.info('No VS Code workspaces found.');
    return;
  }

  console.table(
    workspaces.map((ws) => ({
      'Storage Hash': ws.storageHash,
      'Workspace Path': ws.workspacePath
    }))
  );
}

/**
 * Removes selected VS Code workspace storage directories.
 */
export async function removeWorkspaces(): Promise<void> {
  const workspaces = await VSCodeService.listWorkspaces();
  const workspacesToHashMap = workspaces.reduce((map, ws) => {
    map.set(ws.storageHash, ws);
    return map;
  }, new Map<string, (typeof workspaces)[0]>());

  if (workspaces.length === 0) {
    DR.logger.info('No VS Code workspaces found.');
    return;
  }

  const selectedHashes = await checkbox({
    message: 'Select workspaces to remove (use space to select):',
    choices: workspaces.map((ws) => ({
      name: `${ws.workspacePath} (${ws.storageHash})`,
      value: ws.storageHash
    }))
  });

  if (selectedHashes.length === 0) {
    DR.logger.info('No workspaces selected.');
    return;
  }

  DR.logger.info(`\nRemoving ${selectedHashes.length} workspace(s)...`);

  for (const hash of selectedHashes) {
    const success = await VSCodeService.deleteWorkspaceByHash(hash);
    if (success) {
      DR.logger.info(
        `Removed workspace: ${workspacesToHashMap.get(hash)?.workspacePath}`
      );
    } else {
      DR.logger.error(`Failed to remove workspace: ${hash}`);
    }
  }

  DR.logger.success('Workspace removal complete.');
}

/**
 * Main vscode command handler.
 *
 * @param command The subcommand to execute (e.g., 'workspace', 'ws')
 * @param action The action to perform (e.g., 'list', 'ls', 'remove', 'rm')
 */
export default async function vscode(
  command?: string,
  action?: string
): Promise<void> {
  if (!command) {
    console.log('Usage: tb vscode <command> <action>');
    console.log('Commands:');
    console.log('  workspace, ws - Manage VS Code workspaces');
    console.log('Actions:');
    console.log('  list, ls     - List all workspaces');
    console.log('  remove, rm   - Remove selected workspaces');
    return;
  }

  const normalizedCommand = command.toLowerCase();
  const normalizedAction = action?.toLowerCase();

  if (normalizedCommand === 'workspace' || normalizedCommand === 'ws') {
    if (normalizedAction === 'list' || normalizedAction === 'ls') {
      await listWorkspaces();
    } else if (normalizedAction === 'remove' || normalizedAction === 'rm') {
      await removeWorkspaces();
    } else {
      console.log('Unknown action. Use "list", "ls", "remove", or "rm".');
    }
  } else {
    console.log('Unknown command. Use "workspace" or "ws".');
  }
}
