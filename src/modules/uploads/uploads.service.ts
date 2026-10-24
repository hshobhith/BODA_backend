import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageDriver } from './interfaces/storage-driver.interface';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { S3StorageDriver } from './drivers/s3-storage.driver';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const VIDEO_MIME_TYPES = ['video/mp4'];
const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const PRESCRIPTION_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];
const PRESCRIPTION_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

@Injectable()
export class UploadsService {
  private readonly driver: StorageDriver;
  /**
   * Health documents (prescriptions). Never handed out as a public URL: the
   * upload returns a storage key, and reads go through an endpoint that
   * checks the caller may see the order the file is attached to.
   */
  private readonly privateDriver: StorageDriver;

  constructor(private readonly configService: ConfigService) {
    const storageDriver = this.configService.get<'local' | 's3'>(
      'storage.driver',
    );

    if (storageDriver === 's3') {
      this.driver = new S3StorageDriver({
        endpoint: this.configService.get<string>('storage.s3.endpoint'),
        region: this.configService.get<string>('storage.s3.region')!,
        bucket: this.configService.get<string>('storage.s3.bucket')!,
        accessKeyId: this.configService.get<string>('storage.s3.accessKeyId'),
        secretAccessKey: this.configService.get<string>(
          'storage.s3.secretAccessKey',
        ),
        forcePathStyle: this.configService.get<boolean>(
          'storage.s3.forcePathStyle',
        )!,
        publicUrl: this.configService.get<string>('storage.s3.publicUrl'),
      });
      // Same bucket; private keys live under the `private/` prefix.
      this.privateDriver = this.driver;
    } else {
      this.driver = new LocalStorageDriver(
        this.configService.get<string>('storage.uploadDir')!,
      );
      this.privateDriver = new LocalStorageDriver(
        this.configService.get<string>('storage.privateUploadDir')!,
      );
    }
  }

  /** Stores an image the server fetched itself (e.g. a catalogue photo), same checks as an upload. */
  async uploadImageBuffer(buffer: Buffer, mimetype: string, folder: string): Promise<{ url: string }> {
    const extension = mimetype.split('/')[1] ?? 'jpg';
    const file = {
      buffer,
      mimetype,
      size: buffer.length,
      originalname: `image.${extension}`,
    } as Express.Multer.File;
    return this.uploadImage(file, folder);
  }

  /** Stores a customer's prescription privately and returns its storage key. */
  async uploadPrescription(file: Express.Multer.File, userId: string): Promise<{ key: string }> {
    this.validateFile(file, PRESCRIPTION_MIME_TYPES, PRESCRIPTION_MAX_SIZE_BYTES, 'prescription');
    // Fixed name: keeps the customer's own file name (often their name) out
    // of storage, and the extension is what the local driver serves the
    // content type from.
    const extension = file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype.split('/')[1];
    const { key } = await this.privateDriver.upload(
      { ...file, originalname: `prescription.${extension}` },
      `private/prescriptions/${userId}`,
    );
    return { key };
  }

  /**
   * True if `key` is a prescription this user uploaded. Keys are scoped by
   * uploader, so a customer can't attach (and then read back through their
   * order) a file someone else uploaded.
   */
  isOwnPrescriptionKey(key: string, userId: string): boolean {
    return new RegExp(`^private/prescriptions/${userId}/${UUID_PATTERN}-[A-Za-z0-9._-]+$`).test(key);
  }

  async readPrivate(key: string): Promise<{ body: Buffer; contentType: string }> {
    return this.privateDriver.read(key);
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ url: string }> {
    this.validateFile(
      file,
      IMAGE_MIME_TYPES,
      IMAGE_MAX_SIZE_BYTES,
      'image',
    );

    const { url } = await this.driver.upload(file, folder);
    return { url };
  }

  async uploadVideo(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ url: string }> {
    this.validateFile(
      file,
      VIDEO_MIME_TYPES,
      VIDEO_MAX_SIZE_BYTES,
      'video',
    );

    const { url } = await this.driver.upload(file, folder);
    return { url };
  }

  private validateFile(
    file: Express.Multer.File,
    allowedMimeTypes: string[],
    maxSizeBytes: number,
    kind: 'image' | 'video' | 'prescription',
  ): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid ${kind} type. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }

    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `${kind} file too large. Maximum size is ${Math.floor(
          maxSizeBytes / (1024 * 1024),
        )}MB`,
      );
    }
  }
}
