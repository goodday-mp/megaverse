#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/root/megaverse
ARCHIVE=/tmp/megaverse-history-fix.tar.gz
NEXT_DIR="$APP_DIR/public.next"
BACKUP_DIR="$APP_DIR/public.backup-$(date +%Y%m%d-%H%M%S)"
URL=https://raw.githubusercontent.com/goodday-mp/megaverse/main/deploy/megaverse-history-fix.tar.gz
EXPECTED=0f8cc7983a1048e946167d942b9c67f58c67300ee22bcd6c7b48e28a7d16583a
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
curl -fsS https://megaverse.duckdns.org/assets/index-8zSga5-h.js >/dev/null
printf 'History and leaderboard fix deployed. Backup: %s
' "$BACKUP_DIR"
