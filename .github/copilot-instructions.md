## Overall

Unless otherwise specified, always make suggested edits in the files directly instead of printing them out if you have access to the files.

## Project Features

- Uses TypeScript for the source code

## Formatting

- Always add types when it is not clear what the type of something is. If a type is an object any larger than a single property, it should be a separately declared `type` and not defined inline.
- When creating types in their own file, always use PascalCase for the type name.
  - The file name should match primary type name that is being exported from the file.
- Use arrow-functions where possible to reduce lines of code and simplify things
- Always add JS Doc comments for methods, functions, and classes. Only add JSDoc comments for class properties if they are public, or they could be considered complex in their usage. Always add @param, but do not add @returns.
- Never prefix a function or method with underscores.
- Always order methods in a class by visibility (public, protected, private). If multiple methods have the same visibility, the order doesn't matter.
- Use `async` and `await` for asynchronous code instead of `.then()`.
- Use `const` and `let` instead of `var`.

## Logical Structure

### Imports

- Always use relative imports for files in the same package. Use package references (`import { something } from 'my-package'`) for files in other packages.
- Never use `import * as something from '...'` syntax. Always use named imports.
- Always import at the top of a file. Never inline imports within a function or method unless absolutely necessary.

### Enums

- Always use PascalCase for enum names, and PascalCase for enum values.
- Always use TypeScript `enum` instead of `const enum` or `type` for enums.
