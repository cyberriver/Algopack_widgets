#!/usr/bin/env bash
set -euo pipefail
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version
  exit 0
fi
curl -fsSL https://get.docker.com | sh
apt-get update -y
apt-get install -y docker-compose-plugin
usermod -aG docker "${SUDO_USER:-$USER}" || true
docker --version
docker compose version
echo "Готово. Если ставили не под root — перелогиньтесь, чтобы группа docker применилась."
