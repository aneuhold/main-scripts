#file:../readme.md

# Considerations for AI Agents

### Configuration-Driven Projects

- **`src/services/ConfigService.ts`**: Defines `MainScriptsConfigProject` with properties like `folderName`, `solutionFilePath`, `packageJsonPaths`, `nodemonArgs`, `setupConfig`. Projects are loaded entirely from the user's config file (see readme).
- **`src/services/ProjectConfigService.ts`**: Resolves projects from user config and synthesizes a `setup` function from each project's `setupConfig` block.
- Commands like `tb setup`, `tb dev`, `tb open` use `CurrentEnv.folderName()` to look up project config

### Key Patterns

- **Platform Detection**: Use `CurrentEnv.os` to branch logic for Windows/macOS/Linux
- **OSA Script Builder**: `OsaScriptBuilder` in `src/utils/` constructs AppleScript commands for iTerm2 automation on macOS

## Project-Specific Conventions

### Imports

- Relative imports for same-package files: `import foo from './foo.js'`
- Package imports for external deps: `import { DR } from '@aneuhold/core-ts-lib'`
- **Always use `.js` extension** in imports, even for TypeScript files (required for ESM with `"type": "module"`)

### Types and Enums

- Inline types only for single properties; otherwise declare separate `type` with PascalCase
- File names match primary exported type (e.g., `VideoSeriesInfo.ts` exports `VideoSeriesInfo`)
- Use TypeScript `enum` (not `const enum` or union types) with PascalCase for names and values
- NEVER use `any` type; prefer `unknown` but only if absolutely necessary.
- Avoid using `as` type assertions; refactor code to ensure correct typing instead. Use generics where applicable.
- Try to default to letting TypeScript infer types instead of explicit annotations on return types. Variables should have explicit types.

### Code Style

- Arrow functions preferred for brevity
- JSDoc comments required for functions, methods, classes. Include `@param`, omit `@returns`
- Class method order: public, protected, private
- No underscore prefixes for private methods
- `async`/`await` over `.then()`

### Tests

- Use `src/tests/utils/TestUtils.ts` for common test helpers

## Before Considering a Task Complete

1. Run + fix any issues that come up: `pnpm lint --fix`, `pnpm check`, and `pnpm test`
