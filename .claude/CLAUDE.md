@../readme.md

# main-scripts

## Language

@../node_modules/@aneuhold/robot-instructions/src/instructions/lang/typescript.md

## Runtime

@../node_modules/@aneuhold/robot-instructions/src/instructions/runtime/node.md

## Tooling

@../node_modules/@aneuhold/robot-instructions/src/instructions/tooling/vitest.md

@../node_modules/@aneuhold/robot-instructions/src/instructions/tooling/npm-package.md

## This repo

### Configuration-driven projects

- `src/services/ConfigService.ts` defines `MainScriptsConfigProject` with properties like `folderName`, `solutionFilePath`, `packageJsonPaths`, `nodemonArgs`, `setupConfig`. Projects are loaded entirely from the user's config file (see readme).
- `src/services/ProjectConfigService.ts` resolves projects from user config and synthesizes a `setup` function from each project's `setupConfig` block.
- Commands like `tb setup`, `tb dev`, `tb open` use `CurrentEnv.folderName()` to look up project config.

### Key patterns

- **Platform detection**: use `CurrentEnv.os` to branch logic for Windows/macOS/Linux.
- **OSA script builder**: `OsaScriptBuilder` in `src/utils/` constructs AppleScript commands for iTerm2 automation on macOS.
- **Application services** (`src/services/applications/`): general, cross-OS services for interacting with applications that run on a machine (e.g. `DockerService`, `GitService`). They are shared building blocks. Other areas (e.g. `HomeLab`) should reuse and extend them rather than duplicating that logic. Keep these services focused on the application they cover as if running the service on the machine where the application is housed. Remote access services can thread the output from application services.

### Before considering a task complete

1. Run + fix any issues that come up: `pnpm lint --fix`, `pnpm check`, and `pnpm test`.
