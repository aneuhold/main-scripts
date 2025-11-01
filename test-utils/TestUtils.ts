import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import type { MainScriptsConfig } from '../src/services/ConfigService.js';

/**
 * Test utilities for creating temporary test directories with isolated configurations.
 *
 * This class manages a test directory structure that ensures complete isolation
 * between test runs and prevents pollution of global configuration files.
 *
 * ### Test Directory Structure
 *
 * When tests run, the following directory hierarchy is created:
 *
 * ```txt
 * main-scripts/
 * └── tmp-{uuid}/                     (Unique temp directory per test run)
 *     └── {test-instance-uuid}/       (Unique directory per test)
 *         └── [test files and configs created by individual tests]
 * ```
 */
export class TestUtils {
  private static globalTempDir: string;
  private static originalCwd: string;
  private static testInstanceDir: string;

  /**
   * Sets up the global tmp directory (called once before all test files).
   * Creates a unique temporary directory in the project root.
   */
  static async setupGlobalTempDir(): Promise<void> {
    if (!TestUtils.originalCwd) {
      TestUtils.originalCwd = process.cwd();
    }

    // Create tmp directory with random UUID in the project root
    const projectRoot = path.resolve(__dirname, '..');
    const tmpDirName = `tmp-${randomUUID()}`;
    TestUtils.globalTempDir = path.join(projectRoot, tmpDirName);

    // Clean and recreate the tmp directory
    await fs.remove(TestUtils.globalTempDir);
    await fs.ensureDir(TestUtils.globalTempDir);
  }

  /**
   * Cleans up the global tmp directory (called once after all tests in a test file).
   */
  static async cleanupGlobalTempDir(): Promise<void> {
    if (TestUtils.globalTempDir) {
      await fs.remove(TestUtils.globalTempDir);
    }
    if (TestUtils.originalCwd) {
      process.chdir(TestUtils.originalCwd);
    }
  }

  /**
   * Creates a unique test instance directory for each test.
   * Returns the path to the test instance directory.
   */
  static async setupTestInstance(): Promise<string> {
    if (!TestUtils.globalTempDir) {
      throw new Error(
        'Global temp directory not initialized. Call setupGlobalTempDir() first.'
      );
    }

    // Create a unique directory for this test instance using a UUID
    const testId = randomUUID();
    TestUtils.testInstanceDir = path.join(TestUtils.globalTempDir, testId);
    await fs.ensureDir(TestUtils.testInstanceDir);

    return TestUtils.testInstanceDir;
  }

  /**
   * Cleans up the test instance directory and restores original working directory.
   */
  static async cleanupTestInstance(): Promise<void> {
    // Restore original working directory
    if (TestUtils.originalCwd) {
      process.chdir(TestUtils.originalCwd);
    }

    // Remove the test instance directory
    if (TestUtils.testInstanceDir) {
      await fs.remove(TestUtils.testInstanceDir);
    }
  }

  /**
   * Changes the current working directory to the specified path.
   *
   * @param projectPath - Path to change to
   */
  static changeToDirectory(projectPath: string): void {
    process.chdir(projectPath);
  }

  /**
   * Gets the current test instance directory.
   */
  static getTestInstanceDir(): string {
    if (!TestUtils.testInstanceDir) {
      throw new Error(
        'Test instance directory not initialized. Call setupTestInstance() first.'
      );
    }
    return TestUtils.testInstanceDir;
  }

  /**
   * Creates a .tb-main-scripts.json config file in the specified directory.
   *
   * @param directoryPath - Path to the directory where config should be created
   * @param config - Configuration object to write
   */
  static async createConfigFile(
    directoryPath: string,
    config: MainScriptsConfig
  ): Promise<string> {
    await fs.ensureDir(directoryPath);
    const configPath = path.join(directoryPath, '.tb-main-scripts.json');
    await fs.writeJson(configPath, config, { spaces: 2 });
    return configPath;
  }

  /**
   * Creates a package.json file with a tb-main-scripts configuration section.
   *
   * @param directoryPath - Path to the directory where package.json should be created
   * @param config - Configuration object to write in the tb-main-scripts field
   */
  static async createPackageJsonWithConfig(
    directoryPath: string,
    config: MainScriptsConfig
  ): Promise<string> {
    await fs.ensureDir(directoryPath);
    const packageJsonPath = path.join(directoryPath, 'package.json');
    const packageJson = {
      name: 'test-package',
      version: '1.0.0',
      'tb-main-scripts': config
    };
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    return packageJsonPath;
  }
}
