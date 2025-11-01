import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude build outputs, node_modules, temporary test directories, and local data
    exclude: ['lib/**/*', 'node_modules/**/*', 'tmp-*/**/*', 'localData/**/*'],
    // Reference global setup file
    globalSetup: ['./test-utils/globalSetup.ts']
  }
});
