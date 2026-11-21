#!/bin/sh
# Pulls the latest code and rebuilds/restarts the API. Works wherever the backend folder lives
# on the server (e.g. /var/www/<backend-folder>) — it always runs from its own repo:
#
#   sh <backend-folder>/scripts/deploy.sh               # pull + rebuild + restart, always
#   sh <backend-folder>/scripts/deploy.sh --if-changed  # same, but only when git has new commits
#
# It reads .env.production to pick the same setup you started the server with:
#   - CLOUDFLARE_TUNNEL_TOKEN set  -> --profile tunnel (Cloudflare Tunnel), else --profile caddy
#   - DATABASE_URL set             -> managed database, else adds docker-compose.db.yml (Postgres here)
#
# Auto-deploy after every push (checks every 5 minutes, rebuilds only if something new was pushed);
# use the full path, cron does not start in your folder:
#   crontab -e
#   */5 * * * * sh <backend-folder>/scripts/deploy.sh --if-changed >> <backend-folder>/deploy.log 2>&1
set -eu

cd "$(dirname "$0")/.."

ENV_FILE=.env.production
if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE in $(pwd) — see DEPLOY.md step 2." >&2
  exit 1
fi

# Only one deploy at a time (cron + a manual run could overlap).
LOCK=/tmp/boda-deploy.lock
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  if ! flock -n 9; then
    echo "$(date '+%F %T') another deploy is running — skipping"
    exit 0
  fi
fi

# Value of KEY in .env.production (empty if missing or blank).
env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"' \r'
}

COMPOSE="docker compose -f docker-compose.prod.yml"
if [ -z "$(env_value DATABASE_URL)" ]; then
  COMPOSE="$COMPOSE -f docker-compose.db.yml"
fi
COMPOSE="$COMPOSE --env-file $ENV_FILE"

if [ -n "$(env_value CLOUDFLARE_TUNNEL_TOKEN)" ]; then
  PROFILE=tunnel
else
  PROFILE=caddy
fi

# --- 1. Get the latest code ---
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "${1:-}" = "--if-changed" ] && [ "$LOCAL" = "$REMOTE" ]; then
  exit 0 # nothing new pushed; stay quiet for cron
fi

echo "$(date '+%F %T') deploying $BRANCH: $(git rev-parse --short HEAD) -> $(git rev-parse --short "origin/$BRANCH") (profile: $PROFILE)"
git pull --ff-only origin "$BRANCH"
git log -1 --format='  %h %s (%an)'

# --- 2. Rebuild and restart ---
# `up -d` also starts anything that isn't running (Redis, Postgres, the tunnel/Caddy);
# only the API is rebuilt. Migrations run automatically when the API container starts.
$COMPOSE --profile "$PROFILE" build backend
$COMPOSE --profile "$PROFILE" up -d

# --- 3. Wait for the API's healthcheck ---
CONTAINER=$($COMPOSE ps -q backend)
STATUS=starting
i=0
while [ $i -lt 60 ]; do
  STATUS=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || echo unknown)
  [ "$STATUS" = healthy ] && break
  [ "$STATUS" = unhealthy ] && break
  sleep 5
  i=$((i + 1))
done

$COMPOSE --profile "$PROFILE" ps

if [ "$STATUS" != healthy ]; then
  echo "$(date '+%F %T') API is '$STATUS' — last log lines:" >&2
  $COMPOSE logs --tail 50 backend >&2
  exit 1
fi

# Old image layers pile up with every build; drop the unused ones.
docker image prune -f >/dev/null

echo "$(date '+%F %T') deploy finished — API healthy"
