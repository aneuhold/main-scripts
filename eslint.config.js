import tsLibConfig from '@aneuhold/eslint-config/src/ts-lib-config.js';

/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */
export default [
  ...tsLibConfig,
  {
    ignores: [
      '**/template-folders/**'
    ]
  },
  {
    // other override settings. e.g. for `files: ['**/*.test.*']`
    rules: {
      // Disable this rule due to a bug in the plugin that causes crashes
      '@typescript-eslint/unified-signatures': 'off'
    }
  }
];
