# Main Scripts

[![NPM](https://img.shields.io/npm/v/%40aneuhold%2Fmain-scripts)](https://www.npmjs.com/package/@aneuhold/main-scripts)
[![License](https://img.shields.io/github/license/aneuhold/main-scripts)](https://github.com/aneuhold/main-scripts/blob/main/LICENSE)

This repo contains the main scripts I use on any OS (besides mobile... for now?). This should be installed and initially invoked by the startup script in the [dotfiles repo](https://github.com/aneuhold/dotfiles).

If you would like to start a project with this as a basis, feel free to fork / copy and paste into another repo!

## 📦 Installation

This is typically meant to be installed globally. So for compatibility reasons, the best way to use this is to run:

```
npm install -g @aneuhold/main-scripts
```

This can also be used as a dev dependency

## 🔧 Configuration

You can extend the built-in project configurations with your own custom projects by creating a configuration file. The configuration system uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), which searches for configuration in the following locations (in order):

1. `~/.config/tb-main-scripts.json` (global configuration)
2. `.tb-main-scripts.json` (project-specific)
3. `package.json` with a `"tb-main-scripts"` property

### Configuration Format

Configuration files should contain a `projects` object where each key is the folder name of your project:

```json
{
  "vsCodeAlternativeCommand": "cursor",
  "worktreeBaseDir": "../",
  "projects": {
    "my-custom-project": {
      "folderName": "my-custom-project",
      "solutionFilePath": "MyProject.sln",
      "packageJsonPaths": ["client/package.json"],
      "vsCodeAlternativeCommand": "code",
      "nodemonArgs": {
        ".": ["--ignore", "dist/", "--ext", "ts", "--exec", "npm run build"]
      }
    }
  }
}
```

### Configuration Properties

#### Global Configuration

- `vsCodeAlternativeCommand` (optional): Command to use instead of `code` when opening VS Code. Use this to specify alternative editors like `cursor`, `windsurf`, `ws`, `surf`, etc. Defaults to `code`.
  - **Workspace Storage**: The tool automatically detects which editor settings directory to use based on the command:
    - `code`, `code-insiders` → Uses VS Code settings (`~/Library/Application Support/Code` on macOS)
    - `cursor` → Uses Cursor settings (`~/Library/Application Support/Cursor` on macOS)
    - `ws`, `surf`, `windsurf` → Uses Windsurf settings (`~/Library/Application Support/Windsurf` on macOS)
  - This ensures that when creating git worktrees, the correct editor's workspace storage is copied.
- `worktreeBaseDir` (optional): Base directory for creating git worktrees. Defaults to `../`.
- `projects` (optional): Object containing project-specific configurations.
- `img` (optional): Configuration for the `tb img` command. If omitted, `tb img` will print a setup error. See [`docs/img-upload-initial-setup.md`](docs/img-upload-initial-setup.md) for the one-time Cloudflare R2 setup steps.
  - `pickerDir` (required): Folder that `tb img` scans for files to upload. Supports `~` expansion (e.g. `~/Screenshots`).
  - `r2.accountId` (required): Cloudflare account ID for the R2 bucket.
  - `r2.bucketName` (required): Name of the R2 bucket to upload to.
  - `r2.accessKeyId` (required): Access key ID for the R2 API token.
  - `r2.secretAccessKey` (required): Secret access key for the R2 API token.
  - `r2.publicUrlBase` (required): Public URL base for the bucket, without a trailing slash (e.g. `https://pub-xxxx.r2.dev`).

#### Project-Specific Configuration

Each project configuration supports the following properties:

- `folderName` (required): The name of the project folder
- `solutionFilePath` (optional): Relative path to a .NET solution file to open with `tb open`
- `packageJsonPaths` (optional): Array of relative paths to package.json files for multi-package projects
- `vsCodeAlternativeCommand` (optional): Command to use instead of `code` when opening VS Code for this specific project. Overrides the global setting. See global configuration for workspace storage behavior.
- `nodemonArgs` (optional): Object mapping relative paths to nodemon argument arrays for `tb dev` command
- `worktreeConfig` (optional): Configuration for git worktree behavior
  - `extraFilesToCopy` (optional): Array of file patterns to copy into new worktrees (e.g., `[".env", "environments/*"]`)
  - `postCreateCommands` (optional): Array of commands to run after creating a worktree
  - `autoSetup` (optional): Boolean to automatically run project setup after creating a worktree
- `setupConfig` (optional): Configuration for the `tb setup` command.
  - `installCommand` (optional): Command to run first in the current terminal (e.g. `yarn`, `pnpm i`).
  - `newTabVerticalSplitCommands` (optional): Array of commands to run after the install command. Opens a single new iTerm2 tab, splits it vertically, and runs each command sequentially (chained with `&&`) in the right-hand pane. macOS + iTerm2 only.

## ✅ Commands

Each command starts with `tb`. That stands for Tiny Box but that isn't really important 😛.

- `tb help` Will emit all the commands and their options
- `tb open` Will open the current directory in either VS Code, or Rider depending on how the project is configured in your user config.
  - `tb open r` Will open the associated repo for the current directory
- `tb clean [target]` Cleans up the provided target (e.g., branches). Run without arguments to see available options.
- `tb worktree` or `tb wt` Manage git worktrees with project-aware configuration.
  - `tb worktree add [branchName]` - Create a new worktree
  - `tb worktree list` or `tb wt ls` - List all worktrees
  - `tb worktree remove` or `tb wt rm` - Remove a worktree (interactive)
- `tb config [action]` Shows the current configuration, initializes a new config file, or edits the existing config.
  - `tb config` or `tb config show` - Display current configuration
  - `tb config init` - Create a new config file with defaults
  - `tb config init <folder-name>` - Create a project configuration template for the specified folder
  - `tb config edit` - Open the config file in VS Code
- `tb dev` Starts development mode with nodemon to watch for changes. Auto-detects the current project and runs in the first packageJsonPath directory.
- `tb img` Picks an image from the configured folder, uploads it to Cloudflare R2, prints the public URL, and copies it to the clipboard. Requires an `img` block in your config — see [`docs/img-upload-initial-setup.md`](docs/img-upload-initial-setup.md) for the one-time setup.
  - `-l, --latest` Skip the picker and upload the most-recently-modified image in the directory.
  - `-d, --delete` Delete the local file after a successful upload.
  - `--dir <path>` Override the configured picker directory for this invocation. Supports `~`.
  - `tb img all` Bulk-upload every image in the directory. Prints one `originalName -> url` line per file so the output can be redirected to a file.
    - `--dir <path>` Directory to scan (defaults to `img.pickerDir`).
    - `-d, --delete` Delete each local file after its upload succeeds.
    - `--dry-run` List files that would be uploaded without uploading.
- `tb sub [packagePrefix]` Subscribes to a package using local-npm-registry for automatic updates during development.
- `tb unsub [packagePrefix]` Unsubscribes from a package using local-npm-registry and resets to original version.
- `tb test` Just emits a test echo to see if the package is working.
- `tb update` Will force update this package.
- `tb fpull` Will run `git fetch -a` then `git pull` in the current working directory.
- `tb setup` Will setup the development environment according to the current working directory name. If settings have not been determined yet for the directory name, shell, or terminal, then it will inform you and won't do anything else.
- `tb startup` Will run the startup script for the current system with no arguments
- `tb pkg [packageAction]` Performs actions related to package publishing. Supported actions are: `validateJsr`, `publishJsr`, `validateNpm`, `publishNpm`, `testStringReplacement`. This is typically used inside a package.json file as one of the scripts.

### Commands specifically for `package.json` scripts

- `tb pkg validateJsr` Will run a few steps, where if one fails, the next do not proceed, with exception of reverting the updates to `jsr.json`. That always runs if it was changed:
  1.  Check if there are any pending changes that haven't been committed
  1.  Update the current working directory's `jsr.json` `version` field to match the `version` field in the `package.json` in the same directory
  1.  Run `jsr publish --allow-dirty --dry-run` to ensure it passes the checks of JSR
  1.  Revert the change to the local `jsr.json` file
- `tb pkg publishJsr` Will do the same steps as above, but the `jsr` command will be `jsr publish --allow-dirty`. If running locally, this will prompt you to login with your local browser to JSR and permit the publish. In CI, it should handle this without any intervention if the JSR GitHub action is used.
- `tb pkg validateNpm` Will validate the current project for publishing to npm by running `npm publish --access public --dry-run` and checking for version conflicts on the npm registry.
- `tb pkg publishNpm` Will publish the current project to npm by running `npm publish --access public` after performing validation checks.
- `tb pkg testStringReplacement -o "original" -n "new"` Will test the string replacement functionality used by the package service to replace package names during publishing.

#### Package Command Options

All `pkg` commands support the following options:

- `-a, --alternative-names <names...>` Specify alternative package names to use for publishing/validation. This allows you to test or publish the same package under multiple names.
- `-o, --original-string <string>` For `testStringReplacement` action: the original string to replace.
- `-n, --new-string <string>` For `testStringReplacement` action: the new string to replace it with.

#### Examples

```bash
# Validate JSR publishing with alternative package names
tb pkg validateJsr -a @scope/alt-name @scope/another-name

# Publish to npm with multiple package names
tb pkg publishNpm -a @company/package-v1 @company/package-v2

# Test string replacement functionality
tb pkg testStringReplacement -o "@old/package-name" -n "@new/package-name"
```

> The JSR commands require `jsr` as a dev dependency

## ⚠️ Potential Issues

### Windows Permissions Error with NPM

Sometimes it seems that permissions get messed up. The only solution seems to go to the Program Files for `nodejs` and change the permissions for that folder to allow all local users to have full control. Otherwise installing anything with nodejs doesn't seem to work anymore.

## 🛠️ Development

### 🏞 Flow for Writing New Commands

1. Write the new command in the TypeScript files
1. Test the command by running `pnpm refresh`. Keep running this whenever you want to test the command again.
1. When ready to deploy an update to the package
   1. Run `pnpm version patch`
   1. Run `pnpm lint`
   1. Run `git push` to push to the main branch. Otherwise, feel free to make a PR + run checks + merge it.
1. When done making changes to the package, use `pnpm reset:global` to set the package to the npm registry version instead of having it linked locally.

### `package.json` Commands

- `pnpm refresh` can be used for testing new commands. It will uninstall any previous global version of this package and then install the local version.
- `pnpm reset:global` will uninstall the global package and reinstall it from the npm registry instead of locally.
- `pnpm watch` uses nodemon to watch `src/`, auto-rebuilds and reinstalls globally on TS changes. Ignores `lib/` and `localData/`.

## 🏢 Architecture

### Dual Source Structure

### Command Pattern

- Entry point: `src/index.ts` using Commander.js for CLI parsing
- Each command is a function in `src/commands/` (e.g., `fpull.ts`, `setup.ts`, `pkg.ts`)
- Commands export a default async function that performs the action

### Service Layer

- **`CLIService`**: Executes shell commands via `exec()` (returns all output after completion) or `spawn()` (streams output). Handles cross-platform shell differences (PowerShell on Windows, Zsh/Bash on macOS/Linux)
- **Application Services** (`src/services/applications/`): Abstractions for Chrome, Git, Docker, file system operations
- **`CurrentEnv`**: Detects OS, shell, terminal type, and folder name. Critical for cross-platform behavior

### Build Process Description

This consists of the following steps:

- Delete the `./lib` folder
- Generate the files with TypeScript into the `./lib` folder, including `package.json` because it uses that in some parts of the code.

### Publish Process Description

- Run `pnpm build`
- Packs the files only including the the `./lib` folder and the [default things included](https://docs.npmjs.com/cli/v7/using-npm/developers). This does mean that the `package.json` is going to be in the package twice. But that is okay because the `package.json` that is in the `lib` folder will only be used to reference values. It isn't used for commands or locations of any anything.
- Pushing to main will automatically publish it to NPM
