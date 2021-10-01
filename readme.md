# Main Scripts

This repo contains the main scripts I use on any OS (besides mobile... for now?). This should be installed and initally invoked by the startup script in the [dotfiles repo](https://github.com/aneuhold/dotfiles).

This is also deployed to [NPM here](https://www.npmjs.com/package/@aneuhold/main-scripts).

## ✅ Commands

Each command starts with `tb`. That stands for Tiny Box but that isn't really important 😛. Whenever running a command it will check for updates to this package once a day, and
install them automatically if needed.

- `tb help` Will emit all the commands and their options
- `tb test` Just emits a test echo to see if the package is working.
- `tb update` Will force update this package.

### Testing New Commands

To test new commands, you can write the command, then use the `npm run refresh` command if you want to try it globally. This will install the commands globally and uninstall any previous version if it was there. After this is done, it will have a link to the directory with this package for running commands. So you need to run `yarn build` for it to update the commands becuase it runs out of the `lib` directory when node gets a hold of it. 

### 🚧 Commands to be Built

- `tb update allthethings` Updates everything it can find globally, but not locally? Might need a better name.
- `tb scaffold node` Scaffolds a node project. Ideas on steps are below:
  - Intialize git and ask for a repo link and all that (setup a dedicated step / js file for this because it will be re-used)
  - Initialize npm (package.json)
  - Create README.md
  - Setup ESLINT with JSON config then update the config with specific values if needed

## `package.json` Commands

- `npm run pushpub` will build then do a `git push` then increment the patch number by one then publish the package to npm. It seems that this needs to be done with npm so that it uses the right credentials.
- `npm run refresh` can be used for testing new commands. It will uninstall any previous global version of this package and then install the local version.
- `yarn add <package-name>` Use yarn to add packages preferably.