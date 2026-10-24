import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { UploadsService } from './uploads.service';

const DEFAULT_FOLDER = 'general';
const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

function sanitizeFolder(folder?: string): string {
  if (!folder) {
    return DEFAULT_FOLDER;
  }

  const sanitized = folder.replace(/[^a-zA-Z0-9-]/g, '');
  return sanitized.length > 0 ? sanitized : DEFAULT_FOLDER;
}

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_MAX_SIZE_BYTES } }))
  @ApiOperation({ summary: 'Upload an image (jpeg, png or webp), max 10MB' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'folder',
    required: false,
    description: 'Destination folder (alphanumeric and dashes only)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<{ url: string }> {
    return this.uploadsService.uploadImage(file, sanitizeFolder(folder));
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_MAX_SIZE_BYTES } }))
  @ApiOperation({ summary: 'Upload a video (mp4), max 50MB' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'folder',
    required: false,
    description: 'Destination folder (alphanumeric and dashes only)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<{ url: string }> {
    return this.uploadsService.uploadVideo(file, sanitizeFolder(folder));
  }

  @Post('prescription')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_MAX_SIZE_BYTES } }))
  @ApiOperation({
    summary: 'Upload a prescription (jpeg, png, webp or pdf), max 10MB',
    description:
      'Stored privately. Returns a storage key to pass as prescriptionKeys when placing the order — never a public URL.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Prescription stored' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadPrescription(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ key: string }> {
    return this.uploadsService.uploadPrescription(file, user.id);
  }
}
