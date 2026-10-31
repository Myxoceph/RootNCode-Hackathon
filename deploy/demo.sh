#!/usr/bin/env bash
# Runs the demo from this Mac (docs/deploy.md, "Final günü"). From the repository root:
#
#   deploy/demo.sh up        start the stack (builds only what changed) and run the preflight
#   deploy/demo.sh tunnel    serve it at PUBLIC_URL through Cloudflare Tunnel; keeps the Mac awake, Ctrl-C stops
#   deploy/demo.sh check     preflight; add a URL to check through the tunnel
#   deploy/demo.sh backup    dump the database (accounts, visits, notes, photos) to deploy/backups/
#   deploy/demo.sh down      backup, then stop the stack (data stays in the volume)
#   deploy/demo.sh logs      follow the API log
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=deploy/.env
[[ -f $ENV_FILE ]] || { echo "deploy/.env missing: cp deploy/.env.example deploy/.env (docs/deploy.md)"; exit 1; }
dc() { docker compose -f deploy/compose.yml --env-file "$ENV_FILE" "$@"; }
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

backup() {
  mkdir -p deploy/backups
  local file="deploy/backups/vagabonds-$(date +%F-%H%M).dump"
  dc exec -T postgres pg_dump -U vagabonds -Fc vagabonds > "$file"
  echo "✓ backup $file ($(du -h "$file" | cut -f1))"
}

case "${1:-}" in
  up)
    docker info > /dev/null 2>&1 || { echo "Docker is not running: open Docker Desktop"; exit 1; }
    [[ -f deploy/otp/data/graph.obj ]] || { echo "No Konya transit graph: run deploy/otp/prepare.sh once (docs/deploy.md)"; exit 1; }
    dc up -d --build --wait
    node deploy/preflight.mjs
    ;;
  tunnel)
    # The token is the tunnel's secret: read from deploy/.env and passed in the environment, never on
    # the command line (other users could read it from the process list).
    # The tunnel was made with `cloudflared tunnel create`, so its routing lives here, not in the
    # dashboard: --url points it at Caddy (HTTP_PORT in deploy/.env).
    token=$(env_value TUNNEL_TOKEN)
    if [[ -n $token ]]; then
      TUNNEL_TOKEN=$token exec caffeinate -i cloudflared tunnel run --url "http://$(env_value HTTP_PORT)"
    elif [[ -f ~/.cloudflared/vagabonds-demo.yml ]]; then
      exec caffeinate -i cloudflared tunnel --config ~/.cloudflared/vagabonds-demo.yml run vagabonds-demo
    else
      echo "No tunnel: set TUNNEL_TOKEN in deploy/.env, or log in (docs/deploy.md, \"Bilgisayardan yayın\")"
      exit 1
    fi
    ;;
  check) node deploy/preflight.mjs "${@:2}" ;;
  backup) backup ;;
  down)
    backup
    dc down
    ;;
  logs) dc logs -f api ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
