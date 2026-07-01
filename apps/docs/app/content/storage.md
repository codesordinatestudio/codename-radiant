# File Storage

Radiant provides a pluggable storage system for handling file uploads. The default `LocalStorageProvider` saves files to disk. For production, swap in the S3 plugin to store files in cloud storage.

## How Uploads Work

When a collection has an `upload` field, the runtime auto-generates a global upload endpoint:

```
POST /api/upload          → Upload a file
GET  /api/uploads/:filename → Serve an uploaded file
```

The upload endpoint accepts `multipart/form-data` with a `file` field and returns metadata about the stored file.

## Uploading a File

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@photo.jpg"
```

Response:

```json
{
  "filename": "a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg",
  "originalName": "photo.jpg",
  "mimetype": "image/jpeg",
  "size": 2048576,
  "url": "/api/uploads/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg"
}
```

## Default: Local Storage

By default, Radiant uses `LocalStorageProvider` which saves files to an `uploads/` directory on disk:

```typescript
// This is the default — no configuration needed
export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
});
```

Files are served at `/api/uploads/:filename`. The upload directory is created automatically.

## S3 Storage Plugin

For production, use the S3 plugin to store files in AWS S3, MinIO, DigitalOcean Spaces, or any S3-compatible service.

### Installation

```bash
bun add @codesordinatestudio/radiant-plugin-s3
```

### Usage

```typescript
import { createRadiant } from "../radiant/runtime";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";
import { s3Storage } from "@codesordinatestudio/radiant-plugin-s3";

export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
  storage: s3Storage({
    bucket: "my-app-uploads",
    region: "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    publicUrl: "https://cdn.myapp.com",  // optional CDN URL
  }),
});
```

### S3 with MinIO

```typescript
import { s3Storage } from "@codesordinatestudio/radiant-plugin-s3";

storage: s3Storage({
  bucket: "uploads",
  region: "us-east-1",
  endpoint: "http://localhost:9000",
  forcePathStyle: true,  // required for MinIO
  accessKeyId: process.env.MINIO_ACCESS_KEY!,
  secretAccessKey: process.env.MINIO_SECRET_KEY!,
})
```

## The StorageProvider Interface

Both local and S3 storage implement the `StorageProvider` interface:

```typescript
interface StorageProvider {
  saveFile(file: File, options?: { filename?: string }): Promise<UploadedFile>;
  deleteFile(filename: string): Promise<void>;
}

interface UploadedFile {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}
```

## Writing a Custom Storage Provider

Implement `StorageProvider` to use any storage backend — Cloudflare R2, Azure Blob, Google Cloud Storage, etc:

```typescript
import type { StorageProvider, UploadedFile } from "@codesordinatestudio/radiant-bun";

class R2StorageProvider implements StorageProvider {
  // ... your R2 implementation ...

  async saveFile(file: File): Promise<UploadedFile> {
    // Upload to R2
    // Return the file metadata
  }

  async deleteFile(filename: string): Promise<void> {
    // Delete from R2
  }
}

// Register it
export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
  storage: new R2StorageProvider(),
});
```

## Using Uploads in Collections

Declare an `upload` field in your schema to store file metadata:

```radiant
collection products {
  fields: {
    name: text
    image: upload @optional
    gallery: upload[] @optional
  }
}
```

When you create or update a record, pass the upload response's `filename` or `url` as the field value:

```bash
# 1. Upload the file
curl -X POST /api/upload -F "file=@product.jpg"
# → { "filename": "abc-123.jpg", "url": "/api/uploads/abc-123.jpg", ... }

# 2. Create the product with the uploaded file URL
curl -X POST /api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget", "image": "abc-123.jpg"}'
```

## Related

- [Plugins](./plugins) — All available plugins
- [Collections](./collections) — Defining `upload` fields in the DSL