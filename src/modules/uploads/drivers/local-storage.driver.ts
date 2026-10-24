import * as fs from 'fs';
import { extname, join, resolve, sep } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StorageDriver } from '../interfaces/storage-driver.interface';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};

export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly uploadDir: string) {}

  async upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ url: string; key: string }> {
    const sanitizedName = this.sanitizeFileName(file.originalname);
    const fileName = `${uuidv4()}-${sanitizedName}`;

    const baseDir = join(process.cwd(), this.uploadDir);
    const targetDir = join(baseDir, folder);
    fs.mkdirSync(targetDir, { recursive: true });

    const filePath = join(targetDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const key = join(folder, fileName);

    return {
      url: `/uploads/${folder}/${fileName}`,
      key,
    };
  }

  async delete(key: string): Promise<void> {
    const baseDir = join(process.cwd(), this.uploadDir);
    const filePath = join(baseDir, key);
    try {
      fs.unlinkSync(filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async read(key: string): Promise<{ body: Buffer; contentType: string }> {
    const baseDir = resolve(process.cwd(), this.uploadDir);
    const filePath = resolve(baseDir, key);
    if (!filePath.startsWith(baseDir + sep)) {
      throw new Error(`Refusing to read outside the upload directory: ${key}`);
    }
    return {
      body: fs.readFileSync(filePath),
      contentType: CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    };
  }

  private sanitizeFileName(originalName: string): string {
    return originalName
      .trim()
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .replace(/_{2,}/g, '_');
  }
}
