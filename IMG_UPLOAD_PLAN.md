# `tb img` — Cloudflare R2 Image Upload Plan

A plan for adding a `tb img` command that uploads an image from a configured
folder to Cloudflare R2 and returns a public URL.

The one-time Cloudflare dashboard setup has already been completed and is
preserved for historical reference in
[`docs/img-upload-initial-setup.md`](docs/img-upload-initial-setup.md). That
document also describes the expected `img` block shape in
`~/.config/tb-main-scripts.json`.

## Goals

- One command: `tb img`
- Pick a file via an interactive picker from a configured local folder, or
  skip the picker with `-l`/`--latest`
- Override the configured folder for a single invocation with `--dir`
- Optionally delete the local file after a successful upload with
  `-d`/`--delete`
- Upload to a private-to-write, public-to-read R2 bucket
- Rename the file on upload to `YYYYMMDD-HHMMSS-<4charhash>.<ext>`
- Print the public URL and copy it to the clipboard
- Credentials live in the existing `~/.config/tb-main-scripts.json`

---

## Command flags

| Flag | Short | Description |
| --- | --- | --- |
| `--latest` | `-l` | Skip the picker and upload the most-recently-modified image in the directory. Errors if the directory is empty of images. |
| `--delete` | `-d` | Delete the local file after a successful upload. Runs only on upload success; a failed upload leaves the file in place. |
| `--dir <path>` | _(none)_ | Override `config.img.pickerDir` for this invocation. Supports `~` expansion. Useful for one-off uploads from a different folder. |

Flags compose. For example `tb img -l -d` grabs the newest file and removes
it after upload, and `tb img -l -d --dir ~/Desktop` does the same against
`~/Desktop` instead of the configured directory.

---

## Code changes

### New dependencies

- `@aws-sdk/client-s3` — official AWS SDK v3 S3 client. R2 is S3-compatible,
  so this is Cloudflare's documented recommendation for Node.js uploads.
- `clipboardy` — tiny cross-platform clipboard library. Pure ESM, no native
  deps. The repo already ships pure-ESM, so no compatibility work.

Added via `pnpm add @aws-sdk/client-s3 clipboardy`.

### New config type (`src/services/ConfigService.ts`)

Extend `MainScriptsConfig` with an optional `img` block:

```ts
export type MainScriptsConfigImg = {
  /** Folder that `tb img` scans for files to upload. Supports `~`. */
  pickerDir: string;
  r2: {
    accountId: string;
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Public URL base, e.g. https://pub-xxxx.r2.dev (no trailing slash). */
    publicUrlBase: string;
  };
};

export type MainScriptsConfig = {
  projects?: Record<string, MainScriptsConfigProject>;
  worktreeBaseDir?: string;
  vsCodeAlternativeCommand?: string;
  img?: MainScriptsConfigImg;
};
```

No change to `DEFAULT_CONFIG` — if `img` is missing, the command will print a
helpful setup error pointing at this plan.

### New service: `src/services/applications/R2Service.ts`

Responsibilities:

- Build an `S3Client` configured for R2 (`endpoint:
  https://<accountId>.r2.cloudflarestorage.com`, `region: "auto"`, forcePath
  style).
- `uploadFile(localPath: string, remoteKey: string): Promise<string>`
  - Reads the file, infers `Content-Type` from extension (png, jpg, jpeg,
    gif, webp, heic, svg, avif — fallback `application/octet-stream`).
  - `PutObjectCommand` with `Bucket`, `Key`, `Body`, `ContentType`. No ACL
    parameter — R2 doesn't use object ACLs; public access is a bucket
    setting.
  - Returns the public URL: `${publicUrlBase}/${remoteKey}`.

This service reads credentials from `ConfigService.loadConfig()` on each
call. Throws a specific error if `config.img?.r2` is missing.

### Filename generator

Kept as a small private helper **inline in `src/commands/img.ts`** — not a
separate utility file. It is only ever called from the `img` command, so it
lives next to its caller.

```ts
const buildRemoteKey = (originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const hash = randomBytes(2).toString('hex'); // 4 hex chars
  return `${stamp}-${hash}${ext}`;
};
```

Example output: `20260409-143052-a3f9.png`.

### New command: `src/commands/img.ts`

Signature:

```ts
export type ImgOptions = {
  latest?: boolean;
  delete?: boolean;
  dir?: string;
};

export default async function img(options: ImgOptions): Promise<void>;
```

Flow:

1. Load config. If `config.img` is missing, print a link to
   `docs/img-upload-initial-setup.md` and exit.
2. Pick the source directory: `options.dir` if provided, else
   `config.img.pickerDir`. Expand `~`. If it does not exist or is empty of
   images, print a helpful message and exit.
3. List image files (filter by extension: png, jpg, jpeg, gif, webp, heic,
   svg, avif), sorted by modified time descending so the most recent
   screenshot is on top.
4. Select the file:
   - If `options.latest` is true, take the first entry (newest by mtime)
     without prompting.
   - Otherwise, use `CLIService.selectFromList` (already used by `open.ts`)
     to let the user pick one. Show basename + relative time ("2m ago").
     Show at most ~20 entries.
5. Build the remote key via the timestamp+hash helper.
6. Call `R2Service.uploadFile(localPath, remoteKey)`.
7. Print the returned URL, and copy it to the clipboard via `clipboardy`.
8. Log `DR.logger.success('Copied URL to clipboard')`.
9. If `options.delete` is true **and** the upload succeeded (step 6 did not
   throw), `unlink` the local file. On any failure before this point, the
   file is left untouched.

### Wire up in `src/index.ts`

Add:

```ts
import img, { ImgOptions } from './commands/img.js';

program
  .command('img')
  .description(
    'Picks an image from the configured folder, uploads it to Cloudflare R2, ' +
      'and copies the public URL to the clipboard'
  )
  .option('-l, --latest', 'Upload the most recently modified image without prompting')
  .option('-d, --delete', 'Delete the local file after a successful upload')
  .option('--dir <path>', 'Override the configured picker directory for this invocation')
  .action(async (options: ImgOptions) => {
    await img(options);
  });
```

### Readme update

Add a `tb img` entry (with its three flags) to the command list in
`readme.md`, and an `img` block to the "Configuration Properties" section
describing `pickerDir` and the five `r2.*` fields. Link to
`docs/img-upload-initial-setup.md` for the one-time R2 setup steps.

---

## File layout summary

```
src/
  commands/
    img.ts                          NEW
  services/
    ConfigService.ts                MODIFIED — add img type
    applications/
      R2Service.ts                  NEW
  index.ts                          MODIFIED — register command + flags
readme.md                           MODIFIED — document tb img + config
docs/
  img-upload-initial-setup.md       EXISTING — historical R2 setup
IMG_UPLOAD_PLAN.md                  THIS FILE
package.json                        MODIFIED — new deps
```

---

## Risks and notes

- **Credentials in plaintext config.** The R2 token lives in
  `~/.config/tb-main-scripts.json`. This file is already used for other
  settings, so the precedent exists, but you should not check this file into
  a public dotfiles repo. If your dotfiles are public, either keep this file
  outside them or switch the relevant fields to env var reads (`R2_*`).
  Not in scope for v1 unless you want it.
- **Token scoping.** The token is scoped to the single `tb-img` bucket in
  step 3 above. If it leaks, the blast radius is "someone can read/write/
  delete objects in that one bucket". Rotate via the R2 API Tokens page.
- **r2.dev rate limits.** Cloudflare does not publish exact numbers, but
  `r2.dev` is documented as not for production. For personal screenshot
  links this has never been a problem in practice. If it ever is, attach a
  custom domain in the bucket's Public access settings and update
  `publicUrlBase` — zero code changes.
- **Filename collisions.** `timestamp-to-the-second` + 4 hex chars = 65,536
  possibilities per second. Collision probability for a single user taking
  screenshots is effectively zero. If you ever batch-upload many files in
  the same second the hash protects you.
- **Egress cost.** Zero. R2 does not charge for egress at any volume. This
  is the whole reason we picked R2 over GCS.

---

## Before considering this done

Per the repo's `copilot-instructions.md`:

1. `pnpm lint --fix`
2. `pnpm check`
3. `pnpm test`
4. Manually run `pnpm refresh` and try `tb img` end to end.
