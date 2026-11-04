import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  // Polled by the Docker healthcheck and uptime monitors, so it must never
  // eat into (or be blocked by) the global rate limit.
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Liveness/readiness check (API up and database reachable)' })
  @ApiResponse({ status: 200, description: 'Healthy' })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
