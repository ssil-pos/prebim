#!/usr/bin/env bash
set -euo pipefail

# prebim deploy script
# - tags each deploy
# - snapshots the deployed site
# - rsyncs to /var/www/sengvis-playground/prebim
#
# NOTE: This project is intentionally AI-first. This deploy pipeline is designed
# to be safe, repeatable, and auditable.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Path to SSH deploy key (keep out of git). Override via env var.
KEY_PATH="${DEPLOY_KEY_PATH:-$ROOT_DIR/.keys/prebim_deploy_ed25519}"
DEST_DIR="/var/www/ssil_prebim"
DEST_APP_DIR="/var/www/ssil_prebim/prebim"
BACKUP_DIR="/root/clawd-dev/backups/prebim"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
TAG="deploy-${TS}"

# Build/version stamp for cache-busting (KST, UTC+9)
# Option B: include explicit KST marker to avoid confusion.
BUILD_KST="$(TZ=Asia/Seoul date +%Y%m%d-%H%M)KST"

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repo: $ROOT_DIR" >&2
  exit 1
fi

COMMIT="$(git rev-parse --short=7 HEAD)"

# 0) Inject build stamp into app + cache busters (tracked files)
# - public/prebim/app.js: const BUILD = '...'
# - public/prebim/index.html: app.css/app.js query params
# - public/prebim/app.js: dynamic imports query params
# This keeps clients from getting stale bundles and makes build time human-readable (KST).
perl -0777 -pi -e "s/const BUILD = '[^']*';/const BUILD = '$BUILD_KST';/g" "$ROOT_DIR/public/prebim/app.js"
perl -0777 -pi -e "s#/prebim/app\\.css\\?v=[^\"']+#/prebim/app.css?v=$BUILD_KST#g" "$ROOT_DIR/public/prebim/index.html"
perl -0777 -pi -e "s#/prebim/app\\.js\\?v=[^\"']+#/prebim/app.js?v=$BUILD_KST#g" "$ROOT_DIR/public/prebim/index.html"
perl -0777 -pi -e "s#/prebim/app\\.css\\?v=[^\"']+#/prebim/app.css?v=$BUILD_KST#g" "$ROOT_DIR/public/prebim/run.html"
perl -0777 -pi -e "s#/prebim/app\\.js\\?v=[^\"']+#/prebim/app.js?v=$BUILD_KST#g" "$ROOT_DIR/public/prebim/run.html"
# NOTE: Do not rewrite dynamic import URLs inside app.js.
# It is easy to break template literals and cause a blank app.
# app.js already uses BUILD (const) for cache-busting.

# Validate after cache-buster injections (fail fast)
node -c "$ROOT_DIR/public/prebim/app.js" >/dev/null

# Commit build bump if anything changed (best-effort; don't fail deploy)
if ! git diff --quiet -- "$ROOT_DIR/public/prebim/app.js" "$ROOT_DIR/public/prebim/index.html" "$ROOT_DIR/public/prebim/run.html"; then
  git add "$ROOT_DIR/public/prebim/app.js" "$ROOT_DIR/public/prebim/index.html" "$ROOT_DIR/public/prebim/run.html"
  git commit -m "chore: bump build ${BUILD_KST}" >/dev/null 2>&1 || true
fi

# Ensure deploy key exists
if [ ! -f "$KEY_PATH" ]; then
  echo "Missing deploy key: $KEY_PATH" >&2
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i $KEY_PATH -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

mkdir -p "$DEST_DIR" "$BACKUP_DIR"

# 1) Tag (auditable deploy point)
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag already exists: $TAG" >&2
  exit 1
fi

git tag -a "$TAG" -m "prebim deploy $TS (AI-assisted)"

echo "Pushing tag: $TAG"
# push current branch (if needed) + tag
BRANCH="$(git symbolic-ref --short HEAD || echo main)"
git push origin "$BRANCH"
git push origin "$TAG"

# 2) Deploy payload
# Deploy ./public to the web root.

SRC_PAYLOAD="$ROOT_DIR/public"

if [ ! -d "$SRC_PAYLOAD" ]; then
  echo "Missing public/ folder: $SRC_PAYLOAD" >&2
  exit 1
fi

# Safety-first deploy:
# - update ONLY the web root index.html
# - update /prebim/ subtree (delete within that subtree only)
# This prevents accidental deletion of unrelated site sections (blog/civilarchi/etc).

mkdir -p "$DEST_APP_DIR"

# 2a) Deploy main landing page
rsync -av \
  "$SRC_PAYLOAD/index.html" "$DEST_DIR/index.html"

# 2b) Deploy /prebim/ app subtree
rsync -av --delete \
  "$SRC_PAYLOAD/prebim/" "$DEST_APP_DIR/"

# 3) Snapshot backup of deployed folder
SNAP_NAME="${TS}_${COMMIT}.tgz"
SNAP_PATH="$BACKUP_DIR/$SNAP_NAME"

tar -czf "$SNAP_PATH" -C "$(dirname "$DEST_DIR")" "$(basename "$DEST_DIR")"

# 4) Log
LOG_FILE="$ROOT_DIR/DEPLOY_LOG.md"
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" <<'MD'
# DEPLOY_LOG — prebim

This log is written by the deployment script.
The pipeline is AI-assisted (Moltbot), but the log exists so humans can audit.

MD
fi

echo "- ${TS} | commit=${COMMIT} | tag=${TAG} | dest=${DEST_DIR} | snapshot=${SNAP_PATH} | via=AI-assisted" >> "$LOG_FILE"

git add "$LOG_FILE"
git commit -m "chore: deploy log ${TS}" >/dev/null 2>&1 || true
# push log update (best effort)
git push origin "$BRANCH" >/dev/null 2>&1 || true

echo "Deployed prebim"
echo "  commit=$COMMIT"
echo "  tag=$TAG"
echo "  dest=$DEST_DIR"
echo "  snapshot=$SNAP_PATH"
