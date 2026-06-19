import tsLibConfig from '@aneuhold/eslint-config/src/ts-lib-config.js';

/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */
export default [
  ...tsLibConfig,
  {
    // other override settings. e.g. for `files: ['**/*.test.*']`
    rules: {
      // Disabled due to bug in ESLint 9.39.0 that causes crashes with unified-signatures rule
      // See: https://github.com/typescript-eslint/typescript-eslint/issues/11732
      // Can be re-enabled once TypeScript-ESLint releases a fix
      '@typescript-eslint/unified-signatures': 'off'
    }
  }
];
