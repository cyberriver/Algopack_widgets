#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не найден. На Ubuntu:"
  echo "  curl -fsSL https://get.docker.com | sh"
  echo "  apt-get install -y docker-compose-plugin"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Нет .env. Скопируйте .env.example и заполните ALGOPACK_TOKEN и DOMAIN."
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [[ -n "${DOMAIN:-}" ]]; then
  echo "HTTPS: Caddy + Let's Encrypt → ${DOMAIN}"
  docker compose --profile https up -d --build
else
  echo "HTTP: порт ${APP_PORT:-3010} (для TLS добавьте DOMAIN= и ACME_EMAIL= в .env)"
  docker compose up -d --build
fi

docker compose ps
echo
echo "Проверка: curl -sS http://127.0.0.1:${APP_PORT:-3010}/api/health"
