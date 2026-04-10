# Imgur Migration Pipeline

Rewrites every `i.imgur.com` image link in an HTML file to a self-hosted R2 URL by downloading each image, re-uploading it via `tb img --all`, and patching the HTML.

## Prerequisites

- `tb` installed globally (`pnpm refresh` from repo root)
- `tb` configured for R2 upload (see `docs/img-upload-initial-setup.md`)

## One-time setup per HTML file

Update the hardcoded `HTML_FILE_PATH` constant in both:

- `scripts/imgur/extractImgurLinks.ts`
- `scripts/imgur/replaceImgurInHtml.ts`

Both must point at the same absolute path.

## Run the pipeline

From the repo root, in order:

```bash
pnpm imgur:extract    # HTML -> scripts/imgur/imgur-links.csv
pnpm imgur:download   # CSV -> scripts/imgur/downloads/*.{png,jpg,...}
pnpm imgur:upload     # downloads/ -> R2 + scripts/imgur/downloads/upload-results.json
pnpm imgur:replace    # HTML + upload-results.json -> scripts/imgur/Main-rewritten.html
```

The final rewritten HTML is written to `scripts/imgur/Main-rewritten.html`. The original file is never modified.

## Notes

- `imgur:download` skips files that already exist on disk, so the step is resumable.
- `imgur:upload` shells out to `tb img --all --dir scripts/imgur/downloads`. The uploaded basename (`{imgurId}.{ext}`) is preserved so the rewrite step can map results back to original URLs without a separate lookup file.
- `imgur:replace` rewrites both `https://` and `http://` variants. Failed uploads are reported but left as imgur URLs in the output.
- To rerun for a different HTML file, either clear `scripts/imgur/downloads/`, `imgur-links.csv`, and `Main-rewritten.html` first, or accept that downloads will be reused when filenames collide.
