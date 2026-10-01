import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { TestUtils } from '../../../test-utils/TestUtils.js';
import CurrentEnv from '../../utils/CurrentEnv.js';
import OSProcessService, { type ProcessInfo } from '../OSProcess.service.js';
import ClaudeCodeService, { ClaudeStorageKind } from './ClaudeCode.service.js';

// Mock the logger to avoid console noise during tests
vi.mock('@aneuhold/core-ts-lib', async () => {
  const actual = await vi.importActual('@aneuhold/core-ts-lib');
  return {
    ...actual,
    DR: {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
        verbose: {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn()
        }
      }
    }
  };
});

const PROJECT_KEY = '-Users-test-Development-my-project';
const DEAD_PID = 99999999;

describe('ClaudeCodeService', () => {
  let homeDir: string;
  let tmpRoot: string;

  /**
   * Writes a file of the given size, creating its parent directories.
   *
   * @param filePath the file to write
   * @param sizeBytes how many bytes to write
   */
  const writeFileOfSize = async (filePath: string, sizeBytes: number) => {
    await fs.outputFile(filePath, Buffer.alloc(sizeBytes));
  };

  /**
   * Writes a `~/.claude/sessions/<pid>.json` file.
   *
   * @param pid the process ID the session runs under
   * @param sessionId the session's ID
   */
  const writeSessionFile = async (pid: number, sessionId: string) => {
    await fs.outputJson(
      path.join(homeDir, '.claude', 'sessions', `${pid}.json`),
      { pid, sessionId }
    );
  };

  beforeAll(async () => {
    await TestUtils.setupGlobalTempDir();
  });

  afterAll(async () => {
    await TestUtils.cleanupGlobalTempDir();
  });

  beforeEach(async () => {
    homeDir = await TestUtils.setupTestInstance();
    const fakeUid = 900000000 + Math.floor(Math.random() * 1000000);
    tmpRoot = path.join('/tmp', `claude-${fakeUid}`);

    vi.spyOn(CurrentEnv, 'homeDir').mockReturnValue(homeDir);
    vi.spyOn(os, 'userInfo').mockReturnValue({
      ...os.userInfo(),
      uid: fakeUid
    });
    const liveProcesses: ProcessInfo[] = [
      { pid: process.pid, commandName: 'claude' }
    ];
    vi.spyOn(OSProcessService, 'getProcessInfo').mockImplementation(
      (options) => {
        const filter = options?.filter ?? (() => true);
        return Promise.resolve(liveProcesses.filter(filter));
      }
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tmpRoot);
    await TestUtils.cleanupTestInstance();
  });

  describe('listStorage', () => {
    it('returns no items when no storage roots exist', async () => {
      expect(await ClaudeCodeService.listStorage()).toEqual([]);
    });

    it('returns one item per kind, heaviest first', async () => {
      await writeFileOfSize(
        path.join(tmpRoot, PROJECT_KEY, 'session-a', 'scratchpad', 'file'),
        20 * 1024
      );
      await writeFileOfSize(
        path.join(
          homeDir,
          '.claude',
          'projects',
          PROJECT_KEY,
          'session-b.jsonl'
        ),
        60 * 1024
      );
      await writeFileOfSize(
        path.join(homeDir, '.claude', 'file-history', 'session-c', 'file'),
        40 * 1024
      );

      const items = await ClaudeCodeService.listStorage();

      expect(
        items.map(({ kind, projectKey, sessionId }) => ({
          kind,
          projectKey,
          sessionId
        }))
      ).toEqual([
        {
          kind: ClaudeStorageKind.Transcript,
          projectKey: PROJECT_KEY,
          sessionId: 'session-b'
        },
        {
          kind: ClaudeStorageKind.FileHistory,
          projectKey: '',
          sessionId: 'session-c'
        },
        {
          kind: ClaudeStorageKind.Scratchpad,
          projectKey: PROJECT_KEY,
          sessionId: 'session-a'
        }
      ]);
      expect(items[0].sizeBytes).toBeGreaterThanOrEqual(60 * 1024);
    });

    it('pairs a transcript file with its sibling directory', async () => {
      const projectDir = path.join(homeDir, '.claude', 'projects', PROJECT_KEY);
      await writeFileOfSize(
        path.join(projectDir, 'session-a', 'subagent.jsonl'),
        8 * 1024
      );
      await writeFileOfSize(path.join(projectDir, 'session-a.jsonl'), 8 * 1024);

      const items = await ClaudeCodeService.listStorage();

      expect(items).toHaveLength(1);
      expect(items[0].paths.sort()).toEqual([
        path.join(projectDir, 'session-a'),
        path.join(projectDir, 'session-a.jsonl')
      ]);
      expect(items[0].sizeBytes).toBeGreaterThanOrEqual(16 * 1024);
    });

    it('marks only the items of sessions with a live process as running', async () => {
      await fs.ensureDir(path.join(tmpRoot, PROJECT_KEY, 'live-session'));
      await fs.ensureDir(path.join(tmpRoot, PROJECT_KEY, 'dead-session'));
      await writeSessionFile(process.pid, 'live-session');
      await writeSessionFile(DEAD_PID, 'dead-session');

      const items = await ClaudeCodeService.listStorage();

      expect(
        Object.fromEntries(
          items.map(({ sessionId, isRunning }) => [sessionId, isRunning])
        )
      ).toEqual({ 'live-session': true, 'dead-session': false });
    });
  });
});
