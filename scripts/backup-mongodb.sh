#!/usr/bin/env bash
# backup-mongodb.sh — Backup MongoDB to Cloudflare R2
# Usage: ./scripts/backup-mongodb.sh
# Requires: mongodump, aws CLI configured for R2 endpoint, .env sourced

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_BASE_DIR:-/tmp/mongo-backups}"
BACKUP_NAME="backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
ARCHIVE_PATH="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/rental-saas}"
MONGO_DB="${MONGO_DB:-rental-saas}"

R2_BUCKET="${R2_BUCKET:-excel-rental}"
R2_BACKUP_PREFIX="${R2_BACKUP_PREFIX:-backups/mongodb}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
R2_RETENTION_DAYS="${R2_RETENTION_DAYS:-30}"

LOG_PREFIX="[BACKUP ${TIMESTAMP}]"

# ─── Helpers ───────────────────────────────────────────────────────────────
log()  { echo "${LOG_PREFIX} $*"; }
error(){ echo "${LOG_PREFIX} ERROR: $*" >&2; }

cleanup_local() {
  log "Removing local archive: ${ARCHIVE_PATH}"
  rm -rf "${BACKUP_PATH}" "${ARCHIVE_PATH}" || true
}

# ─── Pre-flight ────────────────────────────────────────────────────────────
command -v mongodump >/dev/null 2>&1 || { error "mongodump not found"; exit 1; }
command -v aws       >/dev/null 2>&1 || { error "aws CLI not found"; exit 1; }

mkdir -p "${BACKUP_DIR}"
log "Starting MongoDB backup → ${BACKUP_NAME}"

# ─── 1. Dump ───────────────────────────────────────────────────────────────
log "Running mongodump..."
mongodump \
  --uri="${MONGODB_URI}" \
  --db="${MONGO_DB}" \
  --out="${BACKUP_PATH}" \
  --gzip \
  --quiet

log "Dump complete: $(du -sh "${BACKUP_PATH}" | cut -f1)"

# ─── 2. Compress ───────────────────────────────────────────────────────────
log "Compressing to ${ARCHIVE_PATH}..."
tar -czf "${ARCHIVE_PATH}" -C "${BACKUP_DIR}" "${BACKUP_NAME}"
ARCHIVE_SIZE=$(du -sh "${ARCHIVE_PATH}" | cut -f1)
log "Archive size: ${ARCHIVE_SIZE}"
rm -rf "${BACKUP_PATH}"

# ─── 3. Upload to R2 ───────────────────────────────────────────────────────
R2_KEY="${R2_BACKUP_PREFIX}/${BACKUP_NAME}.tar.gz"
log "Uploading to R2: s3://${R2_BUCKET}/${R2_KEY}"

AWS_DEFAULT_REGION=auto \
aws s3 cp "${ARCHIVE_PATH}" "s3://${R2_BUCKET}/${R2_KEY}" \
  --endpoint-url="${R2_ENDPOINT}" \
  --no-progress

log "Upload complete."

# ─── 4. Local cleanup (>LOCAL_RETENTION_DAYS) ──────────────────────────────
log "Cleaning local backups older than ${LOCAL_RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "backup_*.tar.gz" -mtime "+${LOCAL_RETENTION_DAYS}" -delete || true

# ─── 5. R2 cleanup (>R2_RETENTION_DAYS) ───────────────────────────────────
log "Cleaning R2 backups older than ${R2_RETENTION_DAYS} days..."
CUTOFF_DATE=$(date -d "${R2_RETENTION_DAYS} days ago" +%s 2>/dev/null || date -v-${R2_RETENTION_DAYS}d +%s)

AWS_DEFAULT_REGION=auto \
aws s3 ls "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/" \
  --endpoint-url="${R2_ENDPOINT}" | \
while read -r date time size filename; do
  FILE_DATE=$(date -d "${date}" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "${date}" +%s)
  if [ "${FILE_DATE}" -lt "${CUTOFF_DATE}" ]; then
    log "Deleting old R2 backup: ${filename}"
    AWS_DEFAULT_REGION=auto \
    aws s3 rm "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/${filename}" \
      --endpoint-url="${R2_ENDPOINT}" || true
  fi
done

# ─── Done ──────────────────────────────────────────────────────────────────
log "Backup finished successfully: ${BACKUP_NAME}.tar.gz (${ARCHIVE_SIZE})"
echo "BACKUP_NAME=${BACKUP_NAME}"
echo "ARCHIVE_SIZE=${ARCHIVE_SIZE}"
echo "R2_KEY=${R2_KEY}"
