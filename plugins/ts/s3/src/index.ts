import { type StorageProvider, type UploadedFile } from "@codesordinatestudio/radiant-bun";

export interface S3Config {
  /** S3 bucket name */
  bucket: string;
  /** AWS region (e.g., "us-east-1") */
  region: string;
  /** S3 endpoint URL (for S3-compatible services like MinIO, DigitalOcean Spaces) */
  endpoint?: string;
  /** Public URL prefix for serving uploaded files (e.g., "https://cdn.example.com") */
  publicUrl?: string;
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Force path-style URLs (required for MinIO and some S3-compatible services) */
  forcePathStyle?: boolean;
}

type BunS3File = {
  arrayBuffer(): Promise<ArrayBuffer>;
  exists(): boolean | Promise<boolean>;
  presign(options: { expiresIn: number }): string;
};

type BunS3Client = {
  delete(filename: string): Promise<unknown>;
  file(filename: string): BunS3File;
  write(filename: string, file: File): Promise<unknown>;
};

type BunS3ClientConstructor = new (options: {
  accessKeyId: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  region: string;
  secretAccessKey: string;
}) => BunS3Client;

export class RadiantFileS3 implements StorageProvider {
  private readonly s3Cfg: S3Config;
  private readonly s3: BunS3Client;

  constructor(config: S3Config) {
    this.s3Cfg = config;

    // Bun-native S3 client (accessed via global for testability and runtime availability)
    const BunS3Client = (globalThis as typeof globalThis & { Bun?: { S3Client?: BunS3ClientConstructor } }).Bun
      ?.S3Client;
    if (!BunS3Client) {
      throw new Error("Bun.S3Client is not available. Ensure you are running on Bun >= 1.1.44.");
    }
    
    this.s3 = new BunS3Client({
      bucket: this.s3Cfg.bucket,
      region: this.s3Cfg.region,
      endpoint: this.s3Cfg.endpoint,
      accessKeyId: this.s3Cfg.accessKeyId,
      secretAccessKey: this.s3Cfg.secretAccessKey,
      forcePathStyle: this.s3Cfg.forcePathStyle,
    });
  }

  async saveFile(file: File, options?: { filename?: string }): Promise<UploadedFile> {
    const ext = file.name ? file.name.substring(file.name.lastIndexOf('.')) : '';
    const filename = options?.filename ?? `${crypto.randomUUID()}${ext}`;

    try {
      await this.s3.write(filename, file);

      const publicUrl = this.s3Cfg.publicUrl ? `${this.s3Cfg.publicUrl.replace(/\/$/, "")}/${filename}` : `/${filename}`;

      return {
        filename: filename,
        originalName: file.name || "upload",
        mimetype: file.type || "application/octet-stream",
        size: file.size,
        url: publicUrl,
      };
    } catch (err) {
      throw new Error(`S3 upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async deleteFile(filename: string): Promise<void> {
    try {
      await this.s3.delete(filename);
    } catch (err) {
      throw new Error(`S3 delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Creates an S3 storage provider for Radiant uploads.
 */
export function s3Storage(config: S3Config): StorageProvider {
  return new RadiantFileS3(config);
}
