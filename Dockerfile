# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- production dependencies only ---
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- runtime ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Store opening hours and product expiry dates are compared against server
# local time (StoresService.isStoreOpenNow, product-availability.ts), so the
# container must run on the stores' timezone, not the image default of UTC.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata
RUN addgroup -S boda && adduser -S boda -G boda
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
# /app is root-owned, so the local storage driver could not create its upload
# directories at boot; create them up front, owned by the runtime user. Mount
# volumes here to keep files across container rebuilds.
RUN mkdir -p uploads private-uploads && chown boda:boda uploads private-uploads
USER boda
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/${API_PREFIX:-api/v1}/health" > /dev/null || exit 1
# Apply pending migrations, then hand PID 1 to node so it receives SIGTERM.
# Set RUN_MIGRATIONS=false to skip (e.g. when running several replicas).
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js || exit 1; fi; exec node dist/main.js"]
