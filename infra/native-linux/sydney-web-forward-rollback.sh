#!/bin/sh
set -eu

systemctl disable --now sydney-web-forward.socket
systemctl stop sydney-web-forward.service
systemctl reset-failed sydney-web.service
systemctl enable --now sydney-web.service
