#!/bin/sh
# Dumps the production database to backups/ and keeps the last 14 days.
# Run from the backend/ directory, e.g. daily from cron:
#   0 3 * * * cd /opt/boda/backend && ./scripts/backup-db.sh >> backups/backup.log 2>&1
set -eu

mkdir -p backups
stamp=$(date +%Y-%m-%d_%H%M)
file="backups/boda_${stamp}.sql.gz"

docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$file"

find backups -name 'boda_*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') backup written: $file"
