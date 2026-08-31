#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/root/megaverse
ARCHIVE=/tmp/megaverse-activity-frontend-root.tar.gz
NEXT_DIR="$APP_DIR/public.next"
BACKUP_DIR="$APP_DIR/public.backup-$(date +%Y%m%d-%H%M%S)"
URL=https://raw.githubusercontent.com/goodday-mp/megaverse/main/deploy/megaverse-activity-frontend-root.tar.gz
EXPECTED=b54f84df63bd976a9a42e9acabf9562ce17bccddf7b5ab71e5ae7d3706315f7a
curl -fsSL "$URL" -o "$ARCHIVE"
printf '%s  %s
' "$EXPECTED" "$ARCHIVE" | sha256sum -c -
rm -rf "$NEXT_DIR"
mkdir -p "$NEXT_DIR"
tar -xzf "$ARCHIVE" -C "$NEXT_DIR"
test -f "$NEXT_DIR/index.html"
test -d "$NEXT_DIR/assets"
grep -q 'src="/assets/' "$NEXT_DIR/index.html"
cd "$APP_DIR"
cp -a public "$BACKUP_DIR"
rm -rf public
mv "$NEXT_DIR" public
pm2 restart megaverse --update-env
sleep 2
curl -fsS https://megaverse.duckdns.org/assets/index-Xb__oEfC.js >/dev/null
printf 'Deployment complete. Backup: %s
' "$BACKUP_DIR"
