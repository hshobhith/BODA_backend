import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DECORATORS } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_ACTION_KEY, AuditOptions } from '../../common/decorators/audit.decorator';
import { AuditLogService } from './audit-log.service';

interface AuditActionMetadata extends AuditOptions {
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

    if (auditMetadata.roles && !auditMetadata.roles.includes(request.user?.role)) {
      return next.handle();
    }

    const entityType =
      auditMetadata.entityType ??
      this.reflector.get<string[] | undefined>(DECORATORS.API_TAGS, context.getClass())?.[0] ??
      'unknown';

    const idParam = auditMetadata.idParam ?? 'id';
    const entityId: string | undefined = request.params?.[idParam] ?? request.query?.[idParam];

    return next.handle().pipe(
      tap((result: unknown) => {
        void this.auditLogService.record({
          actorId: request.user?.id,
          action: auditMetadata.action,
          entityType,
          // Creates have no id in the request yet — fall back to the created entity's.
          entityId: entityId ?? (result as { id?: string } | undefined)?.id,
          ipAddress: request.ip,
        });
      }),
    );
  }
}
