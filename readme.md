# Main Scripts

This repo contains the main scripts I use on any OS (besides mobile... for now?). This should be installed and initally invoked by the startup script in the [dotfiles repo](https://github.com/aneuhold/dotfiles).

This is also deployed to [NPM here](https://www.npmjs.com/package/@aneuhold/main-scripts).

## ✅ Commands

Each command starts with `tb`. That stands for Tiny Box but that isn't really important 😛. Whenever running a command it will check for updates to this package once a day, and
install them automatically if needed.

- `tb help` Will emit all the commands and their options
- `tb test` Just emits a test echo to see if the package is working.
- `tb update` Will force update this package.
- `tb fpull` Will run `git fetch -a` then `git pull` in the current working directory.
- `tb setup` Will setup the development environment according to the current working directory name. If settings have not been determined yet for the directory name, shell, or terminal, then it will inform you and won't do anything else. 
- `tb startup` Will run the startup script for the current system with no arguments
- `tb scaffold [projectType] [projectName]` Will build the given project type with the given project name as a new folder in the current working directory named with the given `projectName`.

### 🏞 Flow for Writing New Commands

1. Write the new command in the TypeScript files
1. Test the command by running `yarn refresh`. Keep running this whenever you want to test the command again.
1. When ready to deploy an update to the package, use `npm run pushpub`.
1. When done making changes to the package, use `yarn reset:global` to set the package to the npm registry version instead of having it linked locally.

To test new commands, you can write the command, then use the `npm run refresh` command if you want to try it globally. This will install the commands globally and uninstall any previous version if it was there. After this is done, it will have a link to the directory with this package for running commands. So you need to run `yarn build` for it to update the commands becuase it runs out of the `lib` directory when node gets a hold of it. 

### 🚧 Commands to be Built

- `tb refresh` Should refresh everything back to the main branch and run any cleanup as well. This might do different things based on the project, and could have a "yes"/"no" prompt to the list of instructions
- `tb build` to possibly build the project in the current folder depending on the things that are present there. 
- `tb scaffold node` Scaffolds a node project. Ideas on steps are below:
  - Intialize git and ask for a repo link and all that (setup a dedicated step / js file for this because it will be re-used)
  - Initialize npm (package.json)
    - Add the name from the name given
    - Add the scripts with the name given
    - 
  - Create README.md
  - Setup ESLINT with JSON config then update the config with specific values if needed
  - Add Typescript and the tsconfig.json file
  - Add prettier and the .prettierrc.json file
  - Update the tsconfig.json to match what is in this project at the moment probably.
  - Setup the build command in the package.json
  - Ideas on implementation
    - There needs to be a way to create the package.json, perhaps it needs to be built in memory first then written? Not sure. Maybe use npm init first and then grab that file? Looks like npm init might not work because it is interactive.


## `package.json` Commands

- `npm run pushpub` will build then do a `git push` then increment the patch number by one then publish the package to npm. It seems that this needs to be done with npm so that it uses the right credentials.
- `npm run refresh` can be used for testing new commands. It will uninstall any previous global version of this package and then install the local version.
- `yarn reset:global` will uninstall the global package and reinstall it from the npm registry instead of locally.
- `yarn add <package-name>` Use yarn to add packages preferably.

## Build Process Description

This consists of the following steps:

- Delete the `./lib` folder
- Generate the files with TypeScript into the `./lib` folder, including `package.json` because it uses that in some parts of the code. 
- Copy over the templates from the templates folder and overwrite because TypeScript does not copy over anything that isn't `.ts`.

## Publish Process Description

- Run the [build process](#build-process)
- Packs the files only including the the `./lib` folder and the [default things included](https://docs.npmjs.com/cli/v7/using-npm/developers). This does mean that the `package.json` is going to be in the package twice. But that is okay because the `package.json` that is in the `lib` folder will only be used to reference values. It isn't used for commands or locations of any anything. 

## Potential Issues

### Windows Permissions Error with NPM

Sometimes it seems that permissions get messed up. The only solution seems to go to the Program Files for `nodejs` and change the permissions for that folder to allow all local users to have full control. Otherwise installing anything with nodejs doesn't seem to work anymore.