#!/usr/bin/env bash
# A backup of the server's database, and only the newest are kept (docs/deploy.md, "Oracle sunucusu").
# Run hourly by vagabonds-backup.timer and before every update; the Mac copies the newest
# (deploy/failover.sh pull), so it can take over with recent data.
set -euo pipefail

cd "$(dirname "$0")/../.."
KEEP=${VAGABONDS_BACKUPS_KEPT:-48}

deploy/demo.sh backup
ls -1t deploy/backups/vagabonds-*.dump | tail -n "+$((KEEP + 1))" | xargs -r rm --
