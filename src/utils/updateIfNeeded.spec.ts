import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// Prepare mocks for readFile and CLIService.execCmd. These must be defined
// before the module under test is imported so the module uses the mocked
// versions.
const readFileMock = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: readFileMock
}));

const execCmdMock = vi.fn();
vi.mock('../services/CLIService.js', () => ({
  default: {
    execCmd: execCmdMock
  }
}));

describe('updateIfNeeded utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logIfUpdateNeeded logs info when an update is available', async () => {
    // Arrange: set mock return values on the hoisted mocks
    readFileMock.mockResolvedValue(JSON.stringify({ name: 'test-package' }));
    execCmdMock.mockResolvedValue({ didComplete: true, output: 'some-output' });

    // Import after mocks are configured so module uses the mocks
    const { logIfUpdateNeeded } = await import('./updateIfNeeded.js');
    const { DR } = await import('@aneuhold/core-ts-lib');

    // Act
    await logIfUpdateNeeded();

    // Assert: logger.info should be called with update message
    const logger = vi.mocked(DR.logger, { deep: true });
    const infoCalls = logger.info.mock.calls;
    expect(infoCalls.length).toBeGreaterThan(0);
    const calledWith = infoCalls[0][0];
    expect(calledWith).toContain('An update is available for this package');
  });

  it('logIfUpdateNeeded does not log when no update is available', async () => {
    // Arrange: set mock return values on the hoisted mocks
    readFileMock.mockResolvedValue(JSON.stringify({ name: 'test-package' }));
    execCmdMock.mockResolvedValue({ didComplete: true, output: '' });

    const { logIfUpdateNeeded } = await import('./updateIfNeeded.js');
    const { DR } = await import('@aneuhold/core-ts-lib');

    await logIfUpdateNeeded();

    // Ensure the info logger was not called with the update message
    const logger = vi.mocked(DR.logger, { deep: true });
    const infoCalls = logger.info.mock.calls;
    const found = infoCalls.some((call) =>
      call[0].includes('An update is available for this package')
    );
    expect(found).toBe(false);
  });
});
