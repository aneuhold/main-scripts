import { cpSync, statSync } from 'fs';

/**
 * File extensions of the home lab config assets that are read at runtime (the
 * co-located service config files). `tsc` only emits the `.ts` modules, so these
 * static assets need a separate copy step to ship in the published package.
 */
const ASSET_EXTENSIONS = ['.yaml', '.conf'];

/**
 * Copies the home lab config assets from the source tree into the compiled `lib`
 * tree, preserving their nested directory structure.
 */
const SRC_DIR = 'src/config/homelab';
const DEST_DIR = 'lib/config/homelab';

cpSync(SRC_DIR, DEST_DIR, {
  recursive: true,
  filter: (src: string): boolean =>
    statSync(src).isDirectory() ||
    ASSET_EXTENSIONS.some((ext) => src.endsWith(ext))
});
