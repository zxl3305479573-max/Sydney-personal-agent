#!/bin/sh
set -eu

case "${RENEWED_LINEAGE:-}" in
    /etc/letsencrypt/live/sydney-pc)
        systemctl reload sydney-pc-nginx.service
        ;;
esac
