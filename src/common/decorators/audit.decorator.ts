import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';
export const AUDIT_ENTITY_TYPE_KEY = 'auditEntityType';

export interface AuditOptions {
  /**
   * Only record when the acting user has one of these roles. Used on routes
   * shared by sellers and admins (an admin managing a store on its owner's
   * behalf), where only the admin's edits belong in the audit log.
   */
  roles?: string[];
  /**
   * Where to read the entity id from when it isn't `params.id` — checked in
   * `params` first, then `query` (e.g. `storeId` on `/stores/me/store?storeId=`).
   */
  idParam?: string;
}

/**
 * Marks a route handler for audit logging. Consumed by `AuditLogInterceptor`,
 * which writes an `AuditLog` row after the handler resolves successfully.
 *
 * @param action - short machine-readable action name, e.g. `store.approve`.
 * @param entityType - optional entity type this action applies to, e.g. `store`.
 *   If omitted, the interceptor falls back to the controller's `@ApiTags()` value.
 * @param options - see `AuditOptions`.
 */
export const Audit = (action: string, entityType?: string, options: AuditOptions = {}) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, entityType, ...options });
