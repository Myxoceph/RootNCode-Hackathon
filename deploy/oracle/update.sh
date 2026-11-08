#!/usr/bin/env bash
# Keeps the Oracle server on the latest main (docs/deploy.md, "Oracle sunucusu"): run every few
# minutes by vagabonds-update.timer. Nothing happens until the branch moves; then the database is
# backed up, the stack rebuilt (only what changed) and checked, and old images are removed so the
# disk does not fill.
set -euo pipefail

cd "$(dirname "$0")/../.."
BRANCH=${VAGABONDS_BRANCH:-main}

git fetch -q origin "$BRANCH"
[[ $(git rev-parse HEAD) == $(git rev-parse "origin/$BRANCH") ]] && exit 0

echo "$(git rev-parse --short HEAD) → $(git rev-parse --short "origin/$BRANCH")"
# The data as it was before this update's migrations, in case one goes wrong.
deploy/oracle/backup.sh
git merge -q --ff-only "origin/$BRANCH"
deploy/demo.sh up
docker image prune -f > /dev/null
