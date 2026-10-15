# Algopack_widgets

Внешний репозиторий виджетов FUTOI для FinamX Open Platform.

Платформа (`diary-bdui-extension`) сюда не входит. Зависимости — только npm (`@finamx/extension-sdk`, `@finamx/bridge-protocol`). Skill: `finamx-extension-init`.

## Что здесь хранится

- исходники 14 виджетов (один Next.js, порт 3010): 11 FUTOI и 3 лаборатории
- манифесты в `manifests/*.json`: `com.finamx.algopack.futoi.*` и `com.finamx.algopack.lab.*`
- локальная сборка и прогон

`.env` в git не попадает.

## Локально

```bash
cp .env.example .env   # если ещё нет
npm install
npm run manifests      # пишет manifests/*.json с EMBED_PUBLIC_URL или localhost
npm run dev
```

Каталог: http://localhost:3010  
Виджеты: http://localhost:3010/widgets/filter … `/widgets/dashboard`, а также
`/widgets/lab-experiments`, `/widgets/lab-monitor`, `/widgets/lab-results`.

Лаборатория поддерживает параллельные неизменяемые конфигурации, historical replay и отдельный live-журнал.
Бэктест считает edge, Sharpe, Sortino, доходность и денежный результат по заданным капиталу и риску на 1R.
При завершении live-эксперимента сохраняется итоговый отчёт.

## URL бандла — честно

`finamx-ext publish` отправляет **манифест**, не код. Хост потом **pull**’ит iframe с `embedBundleUrl`.

Сейчас платформа **не принимает zip и не хостит бандл** на FinamX. Если URL пустой, после апрува виджет не из чего открыть (gateway падает в свой sandbox).

| Где | Что писать в `embedBundleUrl` |
|---|---|
| Локальный прогон | `http://localhost:3010/` |
| GitHub Pages | `https://cyberriver.github.io/Algopack_widgets/` |
| Модерация на стенде | тот же Pages URL |

Обзор сначала показывает поле токена ALGOPACK (как [Finam Chart](https://minakovmax.github.io/finam-chart/)). После «Подключиться» токен остаётся в этом браузере и графики грузятся с MOEX. В хост и топики токен не уходит.

Чтобы выложить обзор:

1. Запушить `master` в `cyberriver/Algopack_widgets` (`.env` не коммитить).
2. В репозитории: Settings → Pages → Build and deployment → **GitHub Actions**.
3. Дождаться workflow `github-pages`.

Каталог: https://cyberriver.github.io/Algopack_widgets/  
Обзор: https://cyberriver.github.io/Algopack_widgets/widgets/dashboard/

```bash
npm run bake
GITHUB_PAGES=1 EMBED_PUBLIC_URL=https://cyberriver.github.io/Algopack_widgets npm run manifests
npm run build:pages
```

Каталог после деплоя: https://cyberriver.github.io/Algopack_widgets/

## Docker на Ubuntu (REG.RU)

Один контейнер: виджеты + BFF (`/api/futoi/*`). `ALGOPACK_TOKEN` только в `.env` на сервере.

```bash
# на чистой Ubuntu
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin git
git clone git@github.com:cyberriver/Algopack_widgets.git
cd Algopack_widgets
cp .env.example .env
# впишите ALGOPACK_TOKEN
chmod +x deploy/vps.sh
./deploy/vps.sh
```

Каталог: `http://IP:3010`  
Обзор: `http://IP:3010/widgets/dashboard`

Когда появится домен, в `.env`:

```
DOMAIN=futoi.ваш-домен.ru
ACME_EMAIL=вы@почта.ru
```

A-запись домена на IP VPS, порты 80 и 443 открыты, затем снова `./deploy/vps.sh`. Caddy сам возьмёт сертификат. В манифесте тогда `EMBED_PUBLIC_URL=https://futoi.ваш-домен.ru`.

Обновление: `git pull && ./deploy/vps.sh`.

## Capabilities по умолчанию

`user.profile.read`, `ui.toast`. Без `requiresAuthContext` и без `@finamx/host-bridge`.
