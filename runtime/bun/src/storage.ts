import fs from 'node:fs';
import path from 'node:path';
import type { StorageProvider, UploadedFile } from '../core/types';

export class LocalStorageProvider implements StorageProvider {
  private readonly uploadDir: string;
  private readonly apiPrefix: string;

  constructor(uploadDir: string = 'uploads', apiPrefix: string = '/api') {
    this.apiPrefix = apiPrefix;
    this.uploadDir = path.resolve(process.cwd(), uploadDir);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(file: File, options?: { filename?: string }): Promise<UploadedFile> {
    const ext = file.name ? path.extname(file.name) : '';
    const safeName = options?.filename 
      ? options.filename 
      : `${crypto.randomUUID()}${ext}`;
      
    const filePath = path.join(this.uploadDir, safeName);
    
    // Convert Web File to ArrayBuffer, then write to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await fs.promises.writeFile(filePath, buffer);

    return {
      filename: safeName,
      originalName: file.name || 'upload',
      mimetype: file.type || 'application/octet-stream',
      size: file.size,
      url: `${this.apiPrefix}/uploads/${safeName}` // Assumes static serving of uploads
    };
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.uploadDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (e) {
      console.error(`Failed to delete file ${filePath}`, e);
    }
  }
}
