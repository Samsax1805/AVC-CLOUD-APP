#!/bin/bash
# Nightly AVC database backup (Atlas free tier has no backups of its own).
#  1. mongodump the whole database to a compressed archive on this server (kept 14 days)
#  2. copy it to the private S3 bucket under backups/ (kept 90 days), so a lost server loses nothing
#  3. if anything fails, every admin gets an email
# Installed as /home/ubuntu/avc-backup.sh; cron runs it at 02:00 UTC.
set -euo pipefail
umask 077
DIR=/home/ubuntu/backups
APP=/home/ubuntu/avc
mkdir -p "$DIR"
fail() {
  echo "$(date -u +%FT%TZ) BACKUP FAILED: $1" >> "$DIR/backup.log"
  (cd "$APP/server" && node "$APP/ops/backup/alert.js" "$1") >> "$DIR/backup.log" 2>&1 || true
  exit 1
}
trap 'fail "step failed at line $LINENO"' ERR
URI=$(grep -E "^MONGO_URI=" "$APP/server/.env" | cut -d= -f2-)
OUT="$DIR/avc-$(date -u +%Y%m%d-%H%M%S).archive.gz"
mongodump --quiet --uri="$URI" --gzip --archive="$OUT"
[ -s "$OUT" ] || fail "the backup file is empty"
SIZE=$(du -h "$OUT" | cut -f1)
(cd "$APP/server" && node "$APP/ops/backup/offsite.js" "$OUT") >> "$DIR/backup.log" 2>&1 || fail "copy to S3 failed"
find "$DIR" -name "avc-*.archive.gz" -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok $SIZE $(basename "$OUT") (also in S3)" >> "$DIR/backup.log"
