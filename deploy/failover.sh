#!/usr/bin/env bash
# The Mac as the Oracle server's stand-in (docs/deploy.md, "Oracle çökerse"). From the repository root, on the Mac:
#
#   deploy/failover.sh pull          copy the server's newest backup here (the LaunchAgent does it every 30 min)
#   deploy/failover.sh takeover      serve vagabonds.allbytech.com from this Mac, with the newest backup
#   deploy/failover.sh handback      copy this Mac's data to the server and give the address back to it
#   deploy/failover.sh status        which machine serves the address, and how old the newest backup here is
#   deploy/failover.sh install-pull  install the LaunchAgent that pulls backups (once per Mac)
#
# Only one machine may run the tunnel: takeover stops the server's first, handback stops this Mac's first.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=deploy/.env
[[ -f $ENV_FILE ]] || { echo "deploy/.env missing (docs/deploy.md)"; exit 1; }
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

SERVER=$(env_value ORACLE_SSH)
KEY=$(env_value ORACLE_SSH_KEY)
KEY=${KEY/#\~/$HOME}
[[ -n $SERVER && -n $KEY ]] || { echo "Set ORACLE_SSH and ORACLE_SSH_KEY in deploy/.env (deploy/.env.example)"; exit 1; }
PUBLIC=$(env_value PUBLIC_URL)
PUBLIC=${PUBLIC:-https://vagabonds.allbytech.com}
REMOTE_DIR=RootNCode-Hackathon
HERE=deploy/backups/oracle
KEPT_HERE=24
TUNNEL_PID=deploy/backups/mac-tunnel.pid
TUNNEL_LOG=deploy/backups/mac-tunnel.log
LOCAL_API=http://$(env_value HTTP_PORT)/api

remote() { ssh -i "$KEY" -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" "$@"; }
uptime_of() { curl -fsS -m 10 "$1/health" 2>/dev/null | sed -n 's/.*"uptimeSeconds":\([0-9]*\).*/\1/p'; }
newest_here() { ls -1t "$HERE"/vagabonds-*.dump 2>/dev/null | head -1 || true; }
age_of() { echo "$(( ($(date +%s) - $(stat -f %m "$1")) / 60 )) dk"; }

pull() {
  mkdir -p "$HERE"
  local newest
  newest=$(remote "ls -1t $REMOTE_DIR/deploy/backups/vagabonds-*.dump 2>/dev/null | head -1")
  [[ -n $newest ]] || { echo "No backup on the server yet"; return 1; }
  [[ -f $HERE/$(basename "$newest") ]] || scp -q -i "$KEY" -o BatchMode=yes "$SERVER:$newest" "$HERE/"
  ls -1t "$HERE"/vagabonds-*.dump | tail -n "+$((KEPT_HERE + 1))" | while read -r old; do rm -- "$old"; done
  echo "✓ $(date '+%F %H:%M') newest: $HERE/$(basename "$newest")"
}

# The address is ours once every answer through the tunnel comes from this Mac's API.
served_here() {
  local mine theirs i
  for i in 1 2 3 4 5; do
    mine=$(uptime_of "$LOCAL_API")
    theirs=$(uptime_of "$PUBLIC/api")
    [[ -n $mine && -n $theirs && $(( theirs - mine )) -le 2 && $(( mine - theirs )) -le 2 ]] || return 1
    sleep 1
  done
}

stop_mac_tunnel() {
  [[ -f $TUNNEL_PID ]] && kill "$(cat "$TUNNEL_PID")" 2> /dev/null || true
  pkill -f "cloudflared tunnel run" 2> /dev/null || true
  rm -f "$TUNNEL_PID"
}

takeover() {
  local start=$SECONDS file i
  echo "1/5 Sunucudaki tüneli durdur"
  if remote "sudo systemctl stop vagabonds-tunnel"; then echo "   durdu"; else echo "   sunucuya ulaşılamadı; tüneli zaten düşmüş olmalı"; fi

  echo "2/5 En yeni yedek"
  pull || echo "   sunucudan çekilemedi; Mac'teki en son yedek kullanılacak"
  file=$(newest_here)
  [[ -n $file ]] || { echo "   Mac'te hiç yedek yok: deploy/demo.sh up ile boş veriyle açılır"; }
  [[ -n $file ]] && echo "   $file ($(age_of "$file") önce)"

  echo "3/5 Mac'teki yığını aç"
  docker info > /dev/null 2>&1 || { echo "   Docker çalışmıyor: Docker Desktop'ı aç ve yeniden dene"; exit 1; }
  docker compose -f deploy/compose.yml --env-file "$ENV_FILE" up -d --build --wait > /dev/null

  echo "4/5 Yedeği yükle"
  [[ -n $file ]] && deploy/demo.sh restore "$file"

  echo "5/5 Tüneli bu Mac'te aç"
  stop_mac_tunnel
  nohup deploy/demo.sh tunnel > "$TUNNEL_LOG" 2>&1 &
  echo $! > "$TUNNEL_PID"
  for i in $(seq 1 30); do served_here && break; sleep 2; done
  if served_here; then
    echo "✓ vagabonds.allbytech.com bu Mac'ten sunuluyor ($(( SECONDS - start )) sn). Tünel kaydı: $TUNNEL_LOG"
  else
    echo "✗ Adres hâlâ bu Mac'e gelmiyor: iki makine bağlı olabilir. deploy/failover.sh status"
    exit 1
  fi
  PREFLIGHT_PASSWORD=$(env_value PREFLIGHT_PASSWORD) node deploy/preflight.mjs "$PUBLIC" || true
}

handback() {
  local file name i
  echo "1/4 Mac'teki veriyi yedekle"
  file=$(deploy/demo.sh backup | sed -n 's/^✓ backup \([^ ]*\).*/\1/p')
  name=$(basename "$file")
  echo "2/4 Sunucuya yükle"
  scp -q -i "$KEY" -o BatchMode=yes "$file" "$SERVER:$REMOTE_DIR/deploy/backups/$name"
  remote "cd $REMOTE_DIR && deploy/demo.sh restore deploy/backups/$name"
  echo "3/4 Tüneli sunucuya ver"
  stop_mac_tunnel
  remote "sudo systemctl start vagabonds-tunnel"
  echo "4/4 Adres sunucuda mı"
  for i in $(seq 1 30); do
    [[ $(uptime_of "$PUBLIC/api") == $(remote "curl -fsS http://127.0.0.1:8080/api/health" | sed -n 's/.*"uptimeSeconds":\([0-9]*\).*/\1/p') ]] && break
    sleep 2
  done
  PREFLIGHT_PASSWORD=$(env_value PREFLIGHT_PASSWORD) node deploy/preflight.mjs "$PUBLIC" || true
}

status() {
  local pub mac srv file
  pub=$(uptime_of "$PUBLIC/api"); mac=$(uptime_of "$LOCAL_API")
  srv=$(remote "curl -fsS -m 5 http://127.0.0.1:8080/api/health" 2>/dev/null | sed -n 's/.*"uptimeSeconds":\([0-9]*\).*/\1/p' || true)
  echo "adres: ${pub:-cevap yok} sn · sunucu: ${srv:-ulaşılamıyor} sn · Mac: ${mac:-kapalı} sn"
  if [[ -n $pub && -n $srv && ${pub} -ge $((srv - 2)) && ${pub} -le $((srv + 2)) ]]; then echo "→ adres sunucuda"
  elif [[ -n $pub && -n $mac && ${pub} -ge $((mac - 2)) && ${pub} -le $((mac + 2)) ]]; then echo "→ adres bu Mac'te"
  else echo "→ belirsiz"; fi
  file=$(newest_here)
  [[ -n $file ]] && echo "Mac'teki en yeni yedek: $file ($(age_of "$file") önce)" || echo "Mac'te yedek yok"
}

install_pull() {
  local plist=~/Library/LaunchAgents/com.vagabonds.backup-pull.plist
  mkdir -p ~/Library/LaunchAgents deploy/backups
  sed "s|__REPO__|$PWD|g" deploy/mac/com.vagabonds.backup-pull.plist > "$plist"
  launchctl bootout "gui/$(id -u)" "$plist" 2> /dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "✓ $plist: every 30 min, log deploy/backups/pull.log"
}

case "${1:-}" in
  pull) pull ;;
  takeover) takeover ;;
  handback) handback ;;
  status) status ;;
  install-pull) install_pull ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
