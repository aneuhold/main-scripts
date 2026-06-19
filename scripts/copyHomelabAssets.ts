import { cpSync, statSync } from 'fs';

/**
 * Copies the home lab config assets that are read at runtime (the co-located
 * `.yaml` files) from the source tree into the compiled `lib` tree, preserving
 * their nested directory structure. `tsc` only emits the `.ts` modules, so these
 * static assets need a separate copy step to ship in the published package.
 */
const SRC_DIR = 'src/config/homelab';
const DEST_DIR = 'lib/config/homelab';

cpSync(SRC_DIR, DEST_DIR, {
  recursive: true,
  filter: (src: string): boolean =>
    statSync(src).isDirectory() || src.endsWith('.yaml')
});
