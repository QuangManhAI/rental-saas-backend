#!/usr/bin/env bash
# restore-mongodb.sh — Restore MongoDB from Cloudflare R2 backup
# Usage: ./scripts/restore-mongodb.sh [BACKUP_NAME]
#   BACKUP_NAME: e.g. backup_20240101_020000 (without .tar.gz)
#   If omitted, lists available backups and prompts for selection.
# Requires: mongorestore, aws CLI configured for R2, .env sourced

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/rental-saas}"
MONGO_DB="${MONGO_DB:-rental-saas}"

R2_BUCKET="${R2_BUCKET:-excel-rental}"
R2_BACKUP_PREFIX="${R2_BACKUP_PREFIX:-backups/mongodb}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

RESTORE_TMP="/tmp/mongo-restore-$$"

LOG_PREFIX="[RESTORE]"

# ─── Helpers ───────────────────────────────────────────────────────────────
log()  { echo "${LOG_PREFIX} $*"; }
error(){ echo "${LOG_PREFIX} ERROR: $*" >&2; exit 1; }

# ─── Pre-flight ────────────────────────────────────────────────────────────
command -v mongorestore >/dev/null 2>&1 || error "mongorestore not found"
command -v aws          >/dev/null 2>&1 || error "aws CLI not found"

# ─── Select backup ─────────────────────────────────────────────────────────
BACKUP_NAME="${1:-}"

if [ -z "${BACKUP_NAME}" ]; then
  log "Fetching available backups from R2..."
  echo ""
  AWS_DEFAULT_REGION=auto \
  aws s3 ls "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/" \
    --endpoint-url="${R2_ENDPOINT}" | \
    awk '{print NR". "$4}' | sort -r

  echo ""
  read -rp "Enter backup filename (e.g. backup_20240101_020000.tar.gz): " SELECTED
  BACKUP_NAME="${SELECTED%.tar.gz}"
fi

ARCHIVE_FILE="${BACKUP_NAME}.tar.gz"
R2_KEY="${R2_BACKUP_PREFIX}/${ARCHIVE_FILE}"

log "Selected backup: ${BACKUP_NAME}"

# ─── Safety confirmation ───────────────────────────────────────────────────
echo ""
echo "⚠️  WARNING: This will restore the '${MONGO_DB}' database."
echo "   All existing data will be overwritten (--drop)."
echo "   Source: s3://${R2_BUCKET}/${R2_KEY}"
echo ""
read -rp "Type 'yes' to confirm: " CONFIRM
[ "${CONFIRM}" = "yes" ] || { log "Restore cancelled."; exit 0; }

# ─── Download ──────────────────────────────────────────────────────────────
mkdir -p "${RESTORE_TMP}"
trap 'rm -rf "${RESTORE_TMP}"' EXIT

log "Downloading ${ARCHIVE_FILE} from R2..."
AWS_DEFAULT_REGION=auto \
aws s3 cp "s3://${R2_BUCKET}/${R2_KEY}" "${RESTORE_TMP}/${ARCHIVE_FILE}" \
  --endpoint-url="${R2_ENDPOINT}" \
  --no-progress

log "Download complete: $(du -sh "${RESTORE_TMP}/${ARCHIVE_FILE}" | cut -f1)"

# ─── Extract ───────────────────────────────────────────────────────────────
log "Extracting archive..."
tar -xzf "${RESTORE_TMP}/${ARCHIVE_FILE}" -C "${RESTORE_TMP}"

DUMP_PATH="${RESTORE_TMP}/${BACKUP_NAME}/${MONGO_DB}"
[ -d "${DUMP_PATH}" ] || error "Expected dump directory not found: ${DUMP_PATH}"

# ─── Restore ───────────────────────────────────────────────────────────────
log "Restoring to '${MONGO_DB}' database..."
mongorestore \
  --uri="${MONGODB_URI}" \
  --db="${MONGO_DB}" \
  --drop \
  --gzip \
  --dir="${DUMP_PATH}" \
  --quiet

log "✅ Restore complete from ${BACKUP_NAME}"
