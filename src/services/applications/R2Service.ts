import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'fs/promises';
import path from 'path';
import { ConfigService, MainScriptsConfigImg } from '../ConfigService.js';

/**
 * Map from lowercased file extension (with leading dot) to the Content-Type
 * header used when uploading to R2.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif'
};

/**
 * A service for uploading files to a Cloudflare R2 bucket using the
 * S3-compatible API.
 */
export default class R2Service {
  private static client: S3Client | null = null;

  /**
   * Uploads a local file to the configured R2 bucket.
   *
   * @param localPath Absolute path to the file on disk.
   * @param remoteKey Object key to write in the bucket (used as the filename
   * in the public URL).
   */
  static async uploadFile(
    localPath: string,
    remoteKey: string
  ): Promise<string> {
    const client = await this.getClient();
    const imgConfig = await this.loadImgConfig();
    const { bucketName, publicUrlBase } = imgConfig.r2;

    const ext = path.extname(localPath).toLowerCase();
    const contentType =
      CONTENT_TYPE_BY_EXTENSION[ext] ?? 'application/octet-stream';

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: remoteKey,
        Body: await readFile(localPath),
        ContentType: contentType
      })
    );

    return `${publicUrlBase}/${remoteKey}`;
  }

  /**
   * Returns the shared S3Client, creating it on first use.
   */
  private static async getClient(): Promise<S3Client> {
    if (this.client) return this.client;

    const imgConfig = await this.loadImgConfig();
    const { accountId, accessKeyId, secretAccessKey } = imgConfig.r2;

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true
    });
    return this.client;
  }

  /**
   * Loads and validates the `img` configuration block, throwing a
   * descriptive error if it is missing.
   */
  private static async loadImgConfig(): Promise<MainScriptsConfigImg> {
    const config = await ConfigService.loadConfig();
    if (!config.img?.r2) {
      throw new Error(
        'Missing `img` configuration in ~/.config/tb-main-scripts.json. ' +
          'See docs/img-upload-initial-setup.md for setup instructions.'
      );
    }
    return config.img;
  }
}
