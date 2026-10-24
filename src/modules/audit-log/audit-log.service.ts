import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { AuditLog } from './entities/audit-log.entity';

export interface RecordAuditLogParams {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  actorId?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Persists an audit log row. Deliberately swallows all errors — an audit
   * logging failure must never take down (or roll back) the caller's request.
   */
  async record(params: RecordAuditLogParams): Promise<void> {
    try {
      const log = this.auditLogRepository.create(params);
      await this.auditLogRepository.save(log);
    } catch (error) {
      this.logger.error(
        `Failed to record audit log for action "${params.action}" on ${params.entityType}${
          params.entityId ? `#${params.entityId}` : ''
        }: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async findAll(
    page: number,
    limit: number,
    filters?: AuditLogFilters,
  ): Promise<PaginatedResult<AuditLog>> {
    const query = this.auditLogRepository
      .createQueryBuilder('auditLog')
      .leftJoinAndSelect('auditLog.actor', 'actor')
      .withDeleted() // keep showing who did it, even after that account is deleted
      .orderBy('auditLog.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters?.action) {
      query.andWhere('auditLog.action = :action', { action: filters.action });
    }
    if (filters?.entityType) {
      query.andWhere('auditLog.entityType = :entityType', {
        entityType: filters.entityType,
      });
    }
    if (filters?.actorId) {
      query.andWhere('auditLog.actorId = :actorId', { actorId: filters.actorId });
    }

    const [data, total] = await query.getManyAndCount();

    return paginate(data, total, page, limit);
  }
}
