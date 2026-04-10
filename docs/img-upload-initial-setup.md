# `tb img` — One-time Cloudflare R2 Setup

This is the historical record of the one-time setup steps that were
performed in the Cloudflare dashboard to make `tb img` work. You should not
need to run these again unless you rotate tokens, switch accounts, or
create a second bucket.

## 1. Create a bucket

1. Log in to the Cloudflare dashboard.
2. Left sidebar → **R2 Object Storage**. If this is your first time, accept
   the R2 terms. R2 requires adding a payment method even for the free tier,
   but you will not be charged unless you exceed 10 GB storage or ~1M writes
   per month.
3. Click **Create bucket**.
4. Name it something like `tb-img` (bucket names are scoped to your account).
5. Leave location as "Automatic". Click **Create bucket**.

## 2. Enable public read access

By default R2 buckets are private. We need anyone on the internet to be able
to `GET` objects by URL.

1. Open the bucket you just created.
2. Go to the **Settings** tab.
3. Under **Public access**, find **R2.dev subdomain** and click **Allow
   Access**. Type `allow` to confirm.
4. Cloudflare will generate a public URL that looks like
   `https://pub-<long-hash>.r2.dev`. **Copy this.** This is your
   `publicUrlBase`.

Note: the `r2.dev` subdomain is rate-limited and Cloudflare officially
describes it as "for development". For personal screenshot-sharing volume
this is fine. If you ever want unlimited throughput, attach a custom domain
under the same **Public access** section — the command does not care which
URL base you use, it just concatenates `publicUrlBase` + `/` + filename.

## 3. Create an API token scoped to this bucket

1. From the R2 landing page (not inside the bucket), click **Manage R2 API
   Tokens** in the right sidebar.
2. Click **Create API token**.
3. **Token name**: something like `tb-main-scripts`.
4. **Permissions**: **Object Read & Write**.
5. **Specify bucket**: pick the `tb-img` bucket you created. Do not leave it
   as "All buckets" — scope the token to just this one.
6. **TTL**: Forever (or set a reminder to rotate).
7. Click **Create API Token**.
8. Cloudflare will show you three values **once**. Copy all three:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint for S3 clients** — this looks like
     `https://<accountid>.r2.cloudflarestorage.com`. The long hex string at
     the start is your **Account ID**.

## 4. Drop the values into your config

Edit `~/.config/tb-main-scripts.json` and add an `img` block:

```json
{
  "projects": {},
  "worktreeBaseDir": "../",
  "img": {
    "pickerDir": "~/Screenshots",
    "r2": {
      "accountId": "abc123...",
      "bucketName": "tb-img",
      "accessKeyId": "...",
      "secretAccessKey": "...",
      "publicUrlBase": "https://pub-xxxxxxxxxxxxxxxx.r2.dev"
    }
  }
}
```

`pickerDir` is the folder `tb img` scans for files. On macOS the default
screenshot location is `~/Desktop`, but many people redirect screenshots to
`~/Screenshots` via
`defaults write com.apple.screencapture location ~/Screenshots`. Set it to
wherever you want the picker to look. `~` is expanded at load time by the
command.
