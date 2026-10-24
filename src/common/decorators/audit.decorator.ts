import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';
export const AUDIT_ENTITY_TYPE_KEY = 'auditEntityType';

/**
 * Marks a route handler for audit logging. Consumed by `AuditLogInterceptor`,
 * which writes an `AuditLog` row after the handler resolves successfully.
 *
 * @param action - short machine-readable action name, e.g. `store.approve`.
 * @param entityType - optional entity type this action applies to, e.g. `store`.
 *   If omitted, the interceptor falls back to the controller's `@ApiTags()` value.
 */
export const Audit = (action: string, entityType?: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, entityType });
