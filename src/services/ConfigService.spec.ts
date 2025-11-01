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
import { TestUtils } from '../../test-utils/TestUtils.js';
import { ConfigService, type MainScriptsConfig } from './ConfigService.js';

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

describe('ConfigService', () => {
  // Global setup/teardown for the tmp directory
  beforeAll(async () => {
    await TestUtils.setupGlobalTempDir();
  });

  afterAll(async () => {
    await TestUtils.cleanupGlobalTempDir();
  });

  beforeEach(async () => {
    await TestUtils.setupTestInstance();
    ConfigService.clearCache();
  });

  afterEach(async () => {
    await TestUtils.cleanupTestInstance();
    ConfigService.clearCache();
  });

  describe('loadConfig', () => {
    it('should load config from .tb-main-scripts.json file', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const config: MainScriptsConfig = {
        projects: {
          'test-project': {
            folderName: 'test-project',
            solutionFilePath: 'TestProject.sln',
            packageJsonPaths: ['package.json']
          }
        }
      };

      await TestUtils.createConfigFile(testInstanceDir, config);
      TestUtils.changeToDirectory(testInstanceDir);

      const loadedConfig = await ConfigService.loadConfig();

      expect(loadedConfig.projects).toBeDefined();
      expect(loadedConfig.projects?.['test-project']).toBeDefined();
      expect(loadedConfig.projects?.['test-project'].folderName).toBe(
        'test-project'
      );
      expect(loadedConfig.projects?.['test-project'].solutionFilePath).toBe(
        'TestProject.sln'
      );
    });

    it('should load config from package.json tb-main-scripts field', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const config: MainScriptsConfig = {
        projects: {
          'package-project': {
            folderName: 'package-project',
            packageJsonPaths: ['client/package.json', 'server/package.json']
          }
        }
      };

      await TestUtils.createPackageJsonWithConfig(testInstanceDir, config);
      TestUtils.changeToDirectory(testInstanceDir);

      const loadedConfig = await ConfigService.loadConfig();

      expect(loadedConfig.projects).toBeDefined();
      expect(loadedConfig.projects?.['package-project']).toBeDefined();
      expect(
        loadedConfig.projects?.['package-project'].packageJsonPaths
      ).toEqual(['client/package.json', 'server/package.json']);
    });

    it('should return empty config when no config file exists', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      TestUtils.changeToDirectory(testInstanceDir);

      const loadedConfig = await ConfigService.loadConfig();

      expect(loadedConfig).toEqual({});
    });

    it('should cache config after first load', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const config: MainScriptsConfig = {
        projects: {
          'cached-project': {
            folderName: 'cached-project'
          }
        }
      };

      await TestUtils.createConfigFile(testInstanceDir, config);
      TestUtils.changeToDirectory(testInstanceDir);

      // First load
      const loadedConfig1 = await ConfigService.loadConfig();
      expect(loadedConfig1.projects?.['cached-project']).toBeDefined();

      // Modify the config file after first load
      const modifiedConfig: MainScriptsConfig = {
        projects: {
          'different-project': {
            folderName: 'different-project'
          }
        }
      };
      await TestUtils.createConfigFile(testInstanceDir, modifiedConfig);

      // Second load should return cached result
      const loadedConfig2 = await ConfigService.loadConfig();
      expect(loadedConfig2.projects?.['cached-project']).toBeDefined();
      expect(loadedConfig2.projects?.['different-project']).toBeUndefined();
      expect(loadedConfig1).toBe(loadedConfig2); // Same instance

      // Clear cache and reload should get new config
      ConfigService.clearCache();
      const loadedConfig3 = await ConfigService.loadConfig();
      expect(loadedConfig3.projects?.['cached-project']).toBeUndefined();
      expect(loadedConfig3.projects?.['different-project']).toBeDefined();
    });

    it('should handle project with nodemonArgs configuration', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const config: MainScriptsConfig = {
        projects: {
          'dev-project': {
            folderName: 'dev-project',
            nodemonArgs: {
              '.': [
                '--ignore',
                'dist/',
                '--ext',
                'ts',
                '--exec',
                'npm run build'
              ],
              client: ['--watch', 'src/', '--ext', 'tsx']
            }
          }
        }
      };

      await TestUtils.createConfigFile(testInstanceDir, config);
      TestUtils.changeToDirectory(testInstanceDir);

      const loadedConfig = await ConfigService.loadConfig();

      expect(loadedConfig.projects?.['dev-project'].nodemonArgs).toBeDefined();
      expect(loadedConfig.projects?.['dev-project'].nodemonArgs?.['.']).toEqual(
        ['--ignore', 'dist/', '--ext', 'ts', '--exec', 'npm run build']
      );
      expect(
        loadedConfig.projects?.['dev-project'].nodemonArgs?.client
      ).toEqual(['--watch', 'src/', '--ext', 'tsx']);
    });

    it('should handle multiple projects in configuration', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const config: MainScriptsConfig = {
        projects: {
          'project-one': {
            folderName: 'project-one',
            solutionFilePath: 'ProjectOne.sln'
          },
          'project-two': {
            folderName: 'project-two',
            packageJsonPaths: ['package.json']
          },
          'project-three': {
            folderName: 'project-three',
            solutionFilePath: 'ProjectThree.sln',
            packageJsonPaths: ['client/package.json']
          }
        }
      };

      await TestUtils.createConfigFile(testInstanceDir, config);
      TestUtils.changeToDirectory(testInstanceDir);

      const loadedConfig = await ConfigService.loadConfig();

      expect(Object.keys(loadedConfig.projects ?? {})).toHaveLength(3);
      expect(loadedConfig.projects?.['project-one']).toBeDefined();
      expect(loadedConfig.projects?.['project-two']).toBeDefined();
      expect(loadedConfig.projects?.['project-three']).toBeDefined();
    });
  });
});
