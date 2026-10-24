import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DECORATORS } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_ACTION_KEY } from '../../common/decorators/audit.decorator';
import { AuditLogService } from './audit-log.service';

interface AuditActionMetadata {
  action: string;
  entityType?: string;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMetadata = this.reflector.get<AuditActionMetadata | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!auditMetadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    const entityType =
      auditMetadata.entityType ??
      this.reflector.get<string[] | undefined>(DECORATORS.API_TAGS, context.getClass())?.[0] ??
      'unknown';

    return next.handle().pipe(
      tap(() => {
        void this.auditLogService.record({
          actorId: request.user?.id,
          action: auditMetadata.action,
          entityType,
          entityId: request.params?.id,
          ipAddress: request.ip,
        });
      }),
    );
  }
}
