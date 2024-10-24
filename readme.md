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

## ✅ Commands

Each command starts with `tb`. That stands for Tiny Box but that isn't really important 😛.

- `tb help` Will emit all the commands and their options
- `tb open` Will open the current directory in either VS Code, or Rider depending on the project as it is configured in [`projects.ts`](src/config/projects.ts).
- `tb test` Just emits a test echo to see if the package is working.
- `tb update` Will force update this package.
- `tb fpull` Will run `git fetch -a` then `git pull` in the current working directory.
- `tb setup` Will setup the development environment according to the current working directory name. If settings have not been determined yet for the directory name, shell, or terminal, then it will inform you and won't do anything else.
- `tb startup` Will run the startup script for the current system with no arguments
- `tb scaffold [projectType] [projectName]` Will build the given project type with the given project name as a new folder in the current working directory named with the given `projectName`.

### Commands specifically for package.json scripts

- `tb pkg validateJsr` Will run a few steps, where if one fails, the next do not proceed:
  1.  Check if there are any pending changes that haven't been committed
  1.  Update the current working directory's `jsr.json` `version` field to match the `version` field in the `package.json` in the same directory
  1.  Run `jsr publish --allow-dirty --dry-run` to ensure it passes the checks of JSR
  1.  Revert the change to the local `jsr.json` file
- `tb pkg publishJsr` Will do the same steps as above, but the `jsr` command will be `jsr publish --allow-dirty`. If running locally, this will prompt you to login with your local browser to JSR and permit the publish. In CI, it should handle this without any intervention if the JSR GitHub action is used.

> Both of the above commands require a dev dependency on `jsr`.

## ⚠️ Potential Issues

### Windows Permissions Error with NPM

Sometimes it seems that permissions get messed up. The only solution seems to go to the Program Files for `nodejs` and change the permissions for that folder to allow all local users to have full control. Otherwise installing anything with nodejs doesn't seem to work anymore.

### Error About Promises.Any when Running Commands

Node likely needs to be updated. Anything 14.x and earlier doesn't support ES2016 syntax pretty sure.

## 🛠️ Development

### 🏞 Flow for Writing New Commands

1. Write the new command in the TypeScript files
1. Test the command by running `yarn refresh`. Keep running this whenever you want to test the command again.
1. When ready to deploy an update to the package
   1. Run `yarn version patch`
   1. Run `yarn lint`
   1. Run `git push` to push to the main branch. Otherwise, feel free to make a PR + run checks + merge it.
1. When done making changes to the package, use `yarn reset:global` to set the package to the npm registry version instead of having it linked locally.

### `package.json` Commands

- `yarn refresh` can be used for testing new commands. It will uninstall any previous global version of this package and then install the local version.
- `yarn reset:global` will uninstall the global package and reinstall it from the npm registry instead of locally.
- `yarn add <package-name>` Use yarn to add packages preferably.

### Build Process Description

This consists of the following steps:

- Delete the `./lib` folder
- Generate the files with TypeScript into the `./lib` folder, including `package.json` because it uses that in some parts of the code.
- Copy over the templates from the templates folder and overwrite because TypeScript does not copy over anything that isn't `.ts`.

### Publish Process Description

- Run `yarn build`
- Packs the files only including the the `./lib` folder and the [default things included](https://docs.npmjs.com/cli/v7/using-npm/developers). This does mean that the `package.json` is going to be in the package twice. But that is okay because the `package.json` that is in the `lib` folder will only be used to reference values. It isn't used for commands or locations of any anything.
- Pushing to main will automatically publish it to NPM

### 🚧 Commands to be Built

- `tb scaffold node` Scaffolds a node project. Ideas on steps are below:
  - Intialize git and ask for a repo link and all that (setup a dedicated step / js file for this because it will be re-used)
  - Initialize npm (package.json)
    - Add the name from the name given
    - Add the scripts with the name given
  - Create README.md
  - Setup ESLINT with JSON config then update the config with specific values if needed
  - Add Typescript and the tsconfig.json file
  - Add prettier and the .prettierrc.json file
  - Update the tsconfig.json to match what is in this project at the moment probably.
  - Setup the build command in the package.json
  - Ideas on implementation
    - There needs to be a way to create the package.json, perhaps it needs to be built in memory first then written? Not sure. Maybe use npm init first and then grab that file? Looks like npm init might not work because it is interactive.
