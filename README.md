# Algopack_widgets

Внешний репозиторий виджетов FUTOI для FinamX Open Platform.

Платформа (`diary-bdui-extension`) сюда не входит. Зависимости — только npm (`@finamx/extension-sdk`, `@finamx/bridge-protocol`). Skill: `finamx-extension-init`.

## Что здесь хранится

- исходники 11 виджетов (один Next.js, порт 3010)
- манифесты в `manifests/*.json` (версия `1.0.1`, те же `extensionId`: `com.finamx.algopack.futoi.*`)
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
Виджеты: http://localhost:3010/widgets/filter … `/widgets/dashboard`

## URL бандла — честно

`finamx-ext publish` отправляет **манифест**, не код. Хост потом **pull**’ит iframe с `embedBundleUrl`.

Сейчас платформа **не принимает zip и не хостит бандл** на FinamX. Если URL пустой, после апрува виджет не из чего открыть (gateway падает в свой sandbox).

| Где | Что писать в `embedBundleUrl` |
|---|---|
| Локальный прогон | `http://localhost:3010/` |
| GitHub Pages | `https://cyberriver.github.io/Algopack_widgets/` |
| Модерация на стенде | тот же Pages URL |

Pages — **статика**, без BFF. Обзор просит токен ALGOPACK и кладёт его в `localStorage` этой вкладки (как Finam Chart). Дальше браузер сам ходит на Мосбиржу. Если CORS закрыт — запасной ряд со сборки.

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

## Capabilities по умолчанию

`user.profile.read`, `ui.toast`. Без `requiresAuthContext` и без `@finamx/host-bridge`.
