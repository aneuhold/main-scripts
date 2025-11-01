#file:../readme.md

# Considerations for AI Agents

### Configuration-Driven Projects

- **`src/config/projects.ts`**: Defines `Project` type with properties like `folderName`, `solutionFilePath`, `packageJsonPaths`, `setup()`, `nodemonArgs`
- Commands like `tb setup`, `tb dev`, `tb open` use `CurrentEnv.folderName()` to look up project config
- Example: `client-core` project has `nodemonArgs` for `tb dev` to run nodemon with build + local-npm publish

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

### Code Style

- Arrow functions preferred for brevity
- JSDoc comments required for functions, methods, classes. Include `@param`, omit `@returns`
- Class method order: public, protected, private
- No underscore prefixes for private methods
- `async`/`await` over `.then()`
