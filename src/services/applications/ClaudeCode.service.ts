import { DR } from '@aneuhold/core-ts-lib';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLI.service.js';
import OSProcessService from '../OSProcess.service.js';
import TextFormattingService from '../TextFormatting.service.js';

/**
 * The kinds of data Claude Code stores on disk for its sessions.
 */
export enum ClaudeStorageKind {
  Scratchpad = 'scratchpad',
  Transcript = 'transcript',
  FileHistory = 'file-history'
}

/**
 * The data one Claude Code session holds in one storage location.
 */
export type ClaudeStorageItem = {
  kind: ClaudeStorageKind;
  /** The session's cwd with non-alphanumerics as `-`. Empty for file history. */
  projectKey: string;
  sessionId: string;
  paths: string[];
  sizeBytes: number;
  modifiedAt: Date;
  isRunning: boolean;
};

/**
 * Service for inspecting and removing the per-session data Claude Code stores
 * on the machine:
 * - Scratchpad: `/tmp/claude-<uid>/<project-key>/<session-id>/`
 * - Transcript: `~/.claude/projects/<project-key>/<session-id>.jsonl` and `<session-id>/`
 * - FileHistory: `~/.claude/file-history/<session-id>/`
 */
export default class ClaudeCodeService {
  /**
   * Lists every item of Claude Code storage on the machine, heaviest first.
   */
  public static async listStorage(): Promise<ClaudeStorageItem[]> {
    if (CurrentEnv.os === OperatingSystemType.Windows) {
      DR.logger.error(
        'Listing Claude Code storage is not supported on Windows.'
      );
      return [];
    }

    // `os.tmpdir()` points under `/var/folders` on macOS, not `/tmp`.
    const tmpRoot = path.join('/tmp', `claude-${os.userInfo().uid}`);
    const claudeDir = path.join(CurrentEnv.homeDir(), '.claude');
    const projectsDir = path.join(claudeDir, 'projects');

    const itemsPerFolder = await Promise.all([
      ...(await ClaudeCodeService.#readFileNames(tmpRoot)).map((projectKey) =>
        ClaudeCodeService.#listItems(
          ClaudeStorageKind.Scratchpad,
          projectKey,
          path.join(tmpRoot, projectKey)
        )
      ),
      ...(await ClaudeCodeService.#readFileNames(projectsDir)).map(
        (projectKey) =>
          ClaudeCodeService.#listItems(
            ClaudeStorageKind.Transcript,
            projectKey,
            path.join(projectsDir, projectKey)
          )
      ),
      ClaudeCodeService.#listItems(
        ClaudeStorageKind.FileHistory,
        '',
        path.join(claudeDir, 'file-history')
      )
    ]);
    const items = itemsPerFolder.flat();
    if (items.length === 0) {
      return [];
    }

    const [sizes, runningSessionIds] = await Promise.all([
      ClaudeCodeService.#getSizesOfPaths(items.flatMap(({ paths }) => paths)),
      ClaudeCodeService.#getRunningSessionIds(path.join(claudeDir, 'sessions'))
    ]);
    for (const item of items) {
      item.sizeBytes = item.paths.reduce(
        (total, itemPath) => total + (sizes.get(itemPath) ?? 0),
        0
      );
      item.isRunning = runningSessionIds.has(item.sessionId);
    }

    return items.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }

  /**
   * Formats a project key for display by removing the home directory prefix.
   * The home directory itself shows as `~`.
   *
   * @param projectKey the project key to format
   */
  public static formatProjectKey(projectKey: string): string {
    const homeKey = CurrentEnv.homeDir().replace(/[^a-zA-Z0-9]/g, '-');
    if (projectKey === homeKey) {
      return '~';
    }
    return projectKey.startsWith(`${homeKey}-`)
      ? projectKey.slice(homeKey.length + 1)
      : projectKey;
  }

  /**
   * Formats a storage item as a single line: size, project, short session
   * ID, modified date, and whether it is running.
   *
   * @param item the item to format
   */
  public static formatClaudeStorageItem(item: ClaudeStorageItem): string {
    const { sizeBytes, projectKey, sessionId, modifiedAt, isRunning } = item;
    const parts = [
      TextFormattingService.formatBytes(sizeBytes),
      ...(projectKey ? [ClaudeCodeService.formatProjectKey(projectKey)] : []),
      sessionId.slice(0, 8),
      modifiedAt.toLocaleDateString()
    ];
    return `${parts.join(' · ')}${isRunning ? ' (running)' : ''}`;
  }

  /**
   * Formats the combined size of the given storage items.
   *
   * @param items the items to total
   */
  public static formatTotalSizeOfStorageItems(
    items: ClaudeStorageItem[]
  ): string {
    return TextFormattingService.formatBytes(
      items.reduce((total, { sizeBytes }) => total + sizeBytes, 0)
    );
  }

  /**
   * Lists one item per session in the given folder. A `<id>.jsonl` file and
   * a `<id>/` folder belong to the same session.
   *
   * @param kind the kind of storage the folder holds
   * @param projectKey the project the folder belongs to
   * @param folder the folder whose entries are sessions
   */
  static async #listItems(
    kind: ClaudeStorageKind,
    projectKey: string,
    folder: string
  ): Promise<ClaudeStorageItem[]> {
    const pathsBySessionId = new Map<string, string[]>();
    for (const name of await ClaudeCodeService.#readFileNames(folder)) {
      const sessionId = path.basename(name, '.jsonl');
      pathsBySessionId.set(sessionId, [
        ...(pathsBySessionId.get(sessionId) ?? []),
        path.join(folder, name)
      ]);
    }

    return Promise.all(
      [...pathsBySessionId].map(async ([sessionId, paths]) => {
        const stats = await Promise.all(paths.map((p) => fs.stat(p)));
        return {
          kind,
          projectKey,
          sessionId,
          paths,
          sizeBytes: 0,
          modifiedAt: new Date(
            Math.max(...stats.map(({ mtimeMs }) => mtimeMs))
          ),
          isRunning: false
        };
      })
    );
  }

  /**
   * Gets the entry names in the given folder, or none when it is missing or
   * is a file.
   *
   * @param folder the folder to read
   */
  static async #readFileNames(folder: string): Promise<string[]> {
    try {
      return await fs.readdir(folder);
    } catch {
      return [];
    }
  }

  /**
   * Maps each of the given paths to its size on disk in bytes, using one `du`
   * call rather than walking the trees.
   *
   * @param paths the files or folders to size
   */
  static async #getSizesOfPaths(paths: string[]): Promise<Map<string, number>> {
    // `|| true` keeps the output when one path is unreadable.
    const { output } = await CLIService.execCmd(
      `du -sk ${paths.map((p) => `'${p}'`).join(' ')} || true`
    );

    const sizes = new Map<string, number>();
    for (const line of output.split('\n')) {
      const [kilobytes, sizedPath] = line.split('\t');
      if (sizedPath) {
        sizes.set(sizedPath, Number(kilobytes) * 1024);
      }
    }
    return sizes;
  }

  /**
   * Gets the IDs of the sessions a live Claude Code process is using. Claude
   * Code writes `<sessionsDir>/<pid>.json` per session, and a crashed session
   * leaves its file behind, so each `pid` is checked against live processes.
   *
   * @param sessionsDir the folder holding the session files
   */
  static async #getRunningSessionIds(
    sessionsDir: string
  ): Promise<Set<string>> {
    const sessionIdsByPid = new Map<number, string>();
    for (const name of await ClaudeCodeService.#readFileNames(sessionsDir)) {
      if (path.extname(name) !== '.json') {
        continue;
      }
      try {
        const session: unknown = await fs.readJson(
          path.join(sessionsDir, name)
        );
        if (
          typeof session === 'object' &&
          session !== null &&
          'pid' in session &&
          typeof session.pid === 'number' &&
          'sessionId' in session &&
          typeof session.sessionId === 'string'
        ) {
          sessionIdsByPid.set(session.pid, session.sessionId);
        }
      } catch {
        // Claude Code may be rewriting the file while it is read.
      }
    }
    if (sessionIdsByPid.size === 0) {
      return new Set();
    }

    const liveProcesses = await OSProcessService.getProcessInfo({
      filter: ({ pid }) => sessionIdsByPid.has(pid)
    });
    return new Set(
      liveProcesses.flatMap(({ pid }) => sessionIdsByPid.get(pid) ?? [])
    );
  }
}
