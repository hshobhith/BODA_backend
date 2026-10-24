# AGENTS.md

Guidance for Claude Code (and other coding agents) working in `backend/` — the NestJS API for
BODA (multi-vendor local commerce & delivery). See [`../README.md`](../README.md) for the product
overview, stack, and quick start, and [`../docs/entity-contract.md`](../docs/entity-contract.md) /
[`../docs/erd.md`](../docs/erd.md) for the canonical schema. This file covers what those don't:
the conventions you need to follow to add code that fits.

## Commands

```bash
npm run start:dev          # nest start --watch, http://localhost:4000 (or PORT from .env)
npm run build               # nest build
npm run lint                 # eslint --fix over src/apps/libs/test — no eslint.config file exists
                              # in this package yet, so this currently errors; fix the config
                              # before relying on it, don't just re-run it
npx tsc --noEmit             # the actual type-check gate; use this to verify a change compiles

npm run migration:generate  # -- -n SomeName   (diffs entities against migrations/, writes a new file)
npm run migration:run        # applies pending migrations (required after a fresh DB or a schema change)
npm run migration:revert     # rolls back the last migration
npm run seed                  # idempotent demo data — see src/database/seeds
```

There are currently **no `*.spec.ts` files anywhere** in this package despite Jest/Supertest being
configured (`npm test` runs Jest but has nothing to collect). Verify changes by running the app and
exercising the actual endpoint (`curl` or Swagger at `/api/docs`), not by assuming test coverage exists.

## Request lifecycle (read this before touching a controller)

Every request passes through global providers wired in two places — **don't** re-register any of
these per-module:

1. `ThrottlerGuard` (global, `app.module.ts`) — rate limiting from `app.throttleTtl`/`throttleLimit`.
2. `JwtAuthGuard` + `RolesGuard` (global, but registered in `auth.module.ts`, not `app.module.ts` —
   easy to miss when grepping `app.module.ts` for guards). Every route requires a valid JWT and,
   if `@Roles(...)` is present, a matching `user.role`, **unless** the handler/controller carries
   `@Public()` (`common/decorators/public.decorator.ts`).
3. `TransformInterceptor` (global) wraps every non-buffer/stream response in `{ success: true, data }`.
   Opt out with `@SkipTransform()` (e.g. PDF/file downloads) rather than hand-rolling the shape.
4. `HttpExceptionFilter` (global) turns any thrown exception into
   `{ statusCode, message, error, path, timestamp }`. Throw Nest's built-in `HttpException` subclasses
   (`NotFoundException`, `ForbiddenException`, etc.) — don't construct error bodies manually.
5. `@Audit('action.name', 'entityType?')` (`common/decorators/audit.decorator.ts`) + the
   `AuditLogInterceptor` it's consumed by — add this to any admin/moderation mutation (approve,
   reject, suspend, delete...) so it shows up in the audit log. It fires on success only, reads
   `entityId` from `request.params.id`, and falls back to the controller's first `@ApiTags()` value
   for `entityType` if you don't pass one.

## Module shape

Every feature under `src/modules/<name>/` follows the same layout — copy an existing one
(`stores/` is a good non-trivial reference) rather than inventing structure:

```
<name>.module.ts       TypeOrmModule.forFeature([...entities]), controller, service,
                        exports: [Service, TypeOrmModule] if other modules need the repository
<name>.controller.ts    thin — validate via DTO, delegate to service, decorate for Swagger
<name>.service.ts        business logic, QueryBuilder usage, all repository access
entities/*.entity.ts    extends common `BaseEntity` (database/base.entity.ts — uuid id,
                        createdAt/updatedAt timestamptz) unless there's a specific reason not to
dto/*.dto.ts            class-validator decorated; `UpdateXDto` is almost always
                        `PartialType(CreateXDto)`, not hand-duplicated fields
```

Entity column names are camelCase and TypeORM/Postgres quotes them exactly — when writing raw SQL
or QueryBuilder string expressions (as in `StoresService.findNearby`'s Haversine distance calc),
remember `"approvalStatus"` needs exact-case double quotes, unlike snake_case columns elsewhere.

Config is centralized in `src/config/*.config.ts`, loaded via `ConfigModule.forRoot({ load: [...] })`
in `app.module.ts`, and validated against `config/validation.schema.ts` (Joi) at boot — add new env
vars to both the relevant `*.config.ts` and the Joi schema, and to `.env.example`, or the app will
fail to boot in a way that's hard to trace back to a missing env var.

## Data model gotchas

- **Store lifecycle**: new stores are created with `status: closed`, `approvalStatus: pending`.
  They will not appear in `StoresService.findNearby` (customer-facing discovery) until an admin
  approves them (`PATCH /admin/stores/:id/approve` → `StoresService.approve`, sets
  `approvalStatus: approved` + `isVerified: true`). Approval does **not** flip `status` to `open` —
  that's a separate seller action (`PATCH /stores/me/store/status`). If a seller reports "my store
  doesn't show up," check both fields, not just one.
- **Integrity rules live in the database too** (migration `AddDataIntegrityConstraints`, declared with
  `@Check` / partial `@Index` on the entities so `migration:generate` stays in sync): non-negative
  money and stock, positive quantities, JSONB columns must be arrays, restaurant/pharmacy stores need
  `licenseInfo`, an order has `prescriptionKeys` exactly when `prescriptionStatus` isn't
  `not_required`, and a barcode is unique among a store's *active* products
  (`UQ_products_store_active_barcode` — `ProductsService` maps the violation to a 409, stores blank
  barcodes as NULL, and `duplicate()` clears it). Fix data before adding a rule; when a write fails
  with a constraint name, the bug is in the code that produced the row, not the constraint.
- **Server timezone matters**: store hours and product expiry compare against server local time, so
  the backend must run in the stores' timezone (the Dockerfile sets `TZ=Asia/Kolkata`).
- **Polymorphic targets**: `reviews` and `wishlist_items` use a `targetType` enum (`product` | `store`)
  + `targetId` uuid instead of two nullable FKs — there's no DB-level FK constraint on `targetId`,
  so a bad `targetId` fails silently at read time rather than at insert time. Validate `targetId`
  existence in the service layer if you touch these paths.
- **Nothing a user deletes is erased — soft deletes only** (product decision, 2026-10-24). Every
  table with a delete action (users, addresses, categories, reviews, cart_items, wishlist_items)
  extends `SoftDeletableEntity` (`database/base.entity.ts`, adds `deletedAt`). Delete with
  `softRemove`/`softDelete`, never `remove`/`delete`; products use `status: archived` instead. Any
  new deletable entity must extend `SoftDeletableEntity` the same way. TypeORM then hides deleted rows
  from every find and query builder, joins included, so:
  - a FK that used to refuse a delete (`RESTRICT`) no longer fires — check in the service instead
    (see `CategoriesService.remove`);
  - unique rules must be partial (`WHERE "deletedAt" IS NULL`) or a deleted row blocks re-creating it,
    except `users.email`/`googleId`, which stay fully unique on purpose: a deleted account can't sign
    back in or re-register (`AuthService` looks users up `withDeleted` and refuses them);
  - history views that must still show a deleted user/address (order reads, order timeline, audit log)
    pass `withDeleted`.
  The `ON DELETE CASCADE` FKs remain for manual SQL only. Deleting rows via psql bypasses all of this
  and the API's guards (last-admin/self-delete), so keep that to local/dev debugging.

## Auth

JWT access + rotating refresh tokens (`RefreshToken` entity, hashed at rest). `AuthService.register`
and friends look up `User` by email; role is one of `customer | seller | admin` and is fixed at
registration (no self-service role change endpoint). `JwtStrategy` (`modules/auth/strategies/jwt.strategy.ts`)
populates `request.user` from the access token payload — that's what `RolesGuard` and `@CurrentUser()`
read.
