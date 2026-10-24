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
RUN npm ci --omit=dev

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
USER boda
EXPOSE 4000
CMD ["node", "dist/main.js"]
