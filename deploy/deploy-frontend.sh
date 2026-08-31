#!/usr/bin/env bash
    set -euo pipefail
    APP=/root/megaverse
    ARCHIVE=/tmp/megaverse-react-public.tar.gz
    cd "$APP"
    curl -fsSL -o "$ARCHIVE" https://raw.githubusercontent.com/goodday-mp/megaverse/main/deploy/megaverse-react-public.tar.gz
    printf '%s  %s\n' 'b1716db0882a96fd58964153fbb67a48f1762cd1335613ac2410d74c14c35a9b' "$ARCHIVE" | sha256sum -c -
    tar -tzf "$ARCHIVE" >/dev/null
    stamp=$(date +%Y%m%d-%H%M%S)
    cp -a public "public.backup-$stamp"
    rm -rf public
    mkdir public
    tar -xzf "$ARCHIVE" -C public
    rm -f "$ARCHIVE"
    pm2 restart megaverse --update-env >/dev/null
    sleep 3
    pm2 status
    curl -fsS -o /dev/null -w 'local_http=%{http_code}\n' http://127.0.0.1:3000/
    echo 'frontend_deploy=complete'
    