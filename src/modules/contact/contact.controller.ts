import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  // Public and sends an email per call, so it gets a much tighter limit than
  // the global default.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post()
  @ApiOperation({ summary: 'Send a message to the support inbox (contact form)' })
  @ApiResponse({ status: 200, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 429, description: 'Too many messages — try again shortly' })
  @ApiResponse({ status: 503, description: 'Mail delivery failed' })
  async submit(@Body() dto: CreateContactMessageDto) {
    await this.contactService.submit(dto);
  }
}
