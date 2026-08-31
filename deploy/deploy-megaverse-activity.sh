#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/root/megaverse
ARCHIVE=/tmp/megaverse-activity-frontend.tar.gz
NEXT_DIR="$APP_DIR/public.next"
BACKUP_DIR="$APP_DIR/public.backup-$(date +%Y%m%d-%H%M%S)"
URL=https://raw.githubusercontent.com/goodday-mp/megaverse/main/deploy/megaverse-activity-frontend.tar.gz
EXPECTED=e66a6bed7e314d3e69df07ac2a4d4362fab26cde73a2bd671dd6597361ba0031
curl -fsSL "$URL" -o "$ARCHIVE"
printf '%s  %s
' "$EXPECTED" "$ARCHIVE" | sha256sum -c -
rm -rf "$NEXT_DIR"
mkdir -p "$NEXT_DIR"
tar -xzf "$ARCHIVE" -C "$NEXT_DIR"
test -f "$NEXT_DIR/index.html"
test -d "$NEXT_DIR/assets"
cd "$APP_DIR"
cp -a public "$BACKUP_DIR"
rm -rf public
mv "$NEXT_DIR" public
pm2 restart megaverse --update-env
sleep 2
curl -fsS https://megaverse.duckdns.org/ >/dev/null
printf 'Deployment complete. Backup: %s
' "$BACKUP_DIR"
