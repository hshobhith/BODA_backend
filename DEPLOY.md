# Deploying the backend to a VPS

Single-server production setup: the API, PostgreSQL 16 and Redis 7 run in Docker behind
[Caddy](https://caddyserver.com), which handles HTTPS (Let's Encrypt) automatically.

Files involved:

| File | Purpose |
|---|---|
| `Dockerfile` | Builds the API image; runs pending migrations on start, has a healthcheck |
| `docker-compose.prod.yml` | API + Redis + Caddy, with memory limits and log rotation (uses `DATABASE_URL`) |
| `docker-compose.db.yml` | Optional: adds Postgres on the same server; add `-f docker-compose.db.yml` to every command |
| `Caddyfile` | Reverse proxy and HTTPS for `API_DOMAIN` (WebSockets included) |
| `.env.production.example` | Template for the server's `.env.production` |
| `scripts/backup-db.sh` | Daily `pg_dump`, keeps 14 days |

## Server size

2 vCPU / 4 GB RAM recommended (2 GB works with swap). Ubuntu 22.04 or 24.04.
Memory limits in the compose file: API 768 MB, Postgres 768 MB, Redis 192 MB, Caddy 128 MB.

## 1. Prepare the server (once)

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in

# 2 GB swap: protects small servers from OOM during image builds
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Firewall: SSH + web only (Postgres/Redis are never published)
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```

Point your API domain's DNS **A record** (e.g. `api.yourdomain.com`) at the server's IP.

## 2. Get the code and configure

```bash
sudo mkdir -p /opt/boda && sudo chown $USER /opt/boda
git clone <your-backend-repo-url> /opt/boda/backend
cd /opt/boda/backend

cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production            # fill in every CHANGE_ME; secrets: openssl rand -base64 48
```

Set `CORS_ORIGINS` / `FRONTEND_URL` to the frontend's real domain, and point the frontend's
`NEXT_PUBLIC_API_URL` at `https://<API_DOMAIN>/api/v1`.

## 3. Start

Choose how the API is reached from the internet:

- `--profile caddy`: the server has its own public IPv4 with ports 80/443. Caddy gets the HTTPS certificate.
- `--profile tunnel`: NAT VPS (shared "Host IP", SSH on an odd port) or no public IPv4. Uses Cloudflare
  Tunnel and needs `CLOUDFLARE_TUNNEL_TOKEN`; the domain's DNS must be on Cloudflare.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile tunnel up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps     # all "healthy"
curl https://<API_DOMAIN>/api/v1/health
```

Migrations run automatically every time the API container starts. Swagger is at
`https://<API_DOMAIN>/api/docs`.

Optional first-time seed (compiled scripts are in the image):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend \
  node dist/database/seeds/seed-categories.js
```

Tip: `alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'`
in `~/.bashrc` shortens every command below to `dc ...`.

## 4. Deploy an update

```bash
cd /opt/boda/backend && git pull
dc up -d --build backend        # rebuilds the API only; DB and Redis keep running
dc logs -f backend
```

## 5. Backups (only with docker-compose.db.yml)

A managed database (Prisma Postgres, Neon, etc.) is backed up by the provider. The script
below is for Postgres running on this server; add `-f docker-compose.db.yml` to its compose command.

```bash
crontab -e
# add:
0 3 * * * cd /opt/boda/backend && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

Copy `backups/` off the server regularly (e.g. `rclone` to Cloudflare R2 / Google Drive). A
backup that lives only on the same VPS is lost with it.

Restore:

```bash
gunzip -c backups/boda_<stamp>.sql.gz | dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Moving from Render

1. On Render, take a dump of the database:
   `pg_dump "<render external database url>" --no-owner | gzip > render.sql.gz`
2. Start only Postgres on the new server: `dc up -d postgres`
3. Restore it with the command above (using `render.sql.gz`), then `dc up -d`.
4. If Render used `STORAGE_DRIVER=local`, those files are on Render's disk. Switch to S3/R2 so
   uploads survive server moves.
5. Switch the DNS record and the frontend's `NEXT_PUBLIC_API_URL` to the new server.

## Useful commands

```bash
dc logs -f backend                   # API logs
dc restart backend                   # restart API
dc exec postgres psql -U boda boda   # SQL shell
docker stats                         # live CPU/RAM per container
```
