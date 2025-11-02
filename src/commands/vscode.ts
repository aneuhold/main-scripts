import VSCodeService from '../services/applications/VSCodeService.js';

/**
 * Lists all VS Code workspace storage directories.
 */
export async function listWorkspaces(): Promise<void> {
  const workspaces = await VSCodeService.listWorkspaces();

  if (workspaces.length === 0) {
    console.log('No VS Code workspaces found.');
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
 * Main vscode command handler.
 *
 * @param command The subcommand to execute (e.g., 'workspace', 'ws')
 * @param action The action to perform (e.g., 'list', 'ls')
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
    console.log('  list, ls - List all workspaces');
    return;
  }

  const normalizedCommand = command.toLowerCase();
  const normalizedAction = action?.toLowerCase();

  if (normalizedCommand === 'workspace' || normalizedCommand === 'ws') {
    if (normalizedAction === 'list' || normalizedAction === 'ls') {
      await listWorkspaces();
    } else {
      console.log('Unknown action. Use "list" or "ls".');
    }
  } else {
    console.log('Unknown command. Use "workspace" or "ws".');
  }
}
