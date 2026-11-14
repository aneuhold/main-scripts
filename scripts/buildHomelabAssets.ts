import { buildSync } from 'esbuild';
import { cpSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Builds the home lab files that are read at runtime into the compiled `lib`
 * tree, preserving their nested directory structure.
 */
const SRC_DIR = 'src/config/homelab';
const DEST_DIR = 'lib/config/homelab';

/**
 * File extensions of the home lab config assets that are read at runtime.
 * They are copied as-is.
 */
const ASSET_EXTENSIONS = ['.yaml', '.json'];

/**
 * Suffix of entry points for code that runs on a home lab machine rather than
 * locally. Each one is bundled with everything it imports into one `.mjs`
 * file, so it runs with plain `node` and no `node_modules`.
 */
const REMOTE_ENTRY_SUFFIX = '.remote.ts';

cpSync(SRC_DIR, DEST_DIR, {
  recursive: true,
  filter: (src: string): boolean =>
    statSync(src).isDirectory() ||
    ASSET_EXTENSIONS.some((ext) => src.endsWith(ext))
});

buildSync({
  entryPoints: readdirSync(SRC_DIR, { encoding: 'utf8', recursive: true })
    .filter((file) => file.endsWith(REMOTE_ENTRY_SUFFIX))
    .map((file) => join(SRC_DIR, file)),
  outbase: SRC_DIR,
  outdir: DEST_DIR,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24'
});
