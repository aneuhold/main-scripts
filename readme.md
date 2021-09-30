# Main Scripts

This repo contains the main scripts I use on any OS (besides mobile... for now?). This should be installed and initally invoked by the startup script in the [dotfiles repo](https://github.com/aneuhold/dotfiles).

This is also deployed to [NPM here](https://www.npmjs.com/package/@aneuhold/main-scripts).

## ✅ Commands

Each command starts with `tb`. That stands for Tiny Box but that isn't really important 😛.

- `tb test` Just emits a test echo to see if the package is working.

### Testing New Commands

To test new commands, you can write the command, then use the `npm run refresh` command. This will install the commands globally and uninstall any previous version if it was there.

Note that you don't need to worry about uninstalling the commands, because whenever running any `tb` command it will check the local version against the version on npm and update if needed. 

### 🚧 Commands to be Built

- `tb scaffold node` Scaffolds a node project. Ideas on steps are below:
  - Intialize git and ask for a repo link and all that (setup a dedicated step / js file for this because it will be re-used)
  - Initialize npm (package.json)
  - Create README.md
  - Setup ESLINT with JSON config then update the config with specific values if needed

## `package.json` Commands

- `npm run pushpub` will do a `git push` then increment the patch number by one then publish the package to npm. It seems that this needs to be done with npm so that it uses the right credentials.
- `npm run refresh` can be used for testing new commands. It will uninstall any previous global version of this package and then install the local version.
- `yarn add <package-name>` Use yarn to add packages preferably.