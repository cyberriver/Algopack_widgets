import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'manifests');
const pages = process.env.GITHUB_PAGES === '1';
const bundle = `${(process.env.EMBED_PUBLIC_URL ?? (pages ? 'https://cyberriver.github.io/Algopack_widgets' : 'http://localhost:3010')).replace(/\/$/, '')}/`;
const entrySuffix = pages ? '/' : '';
const FILTER_TOPIC = 'com.finamx.algopack.futoi.filter';

const WIDGETS = [
  ['filter', 'FUTOI фильтр', 'Выбор фьючерса для виджетов открытых позиций.', true, false],
  ['table', 'FUTOI таблица', 'Снимок открытых позиций физлиц и юрлиц. Обновление каждые 5 минут.', false, true],
  ['long-short-fiz', 'FUTOI long/short физлица', 'Длинные и короткие позиции физических лиц.', false, true],
  ['long-short-yur', 'FUTOI long/short юрлица', 'Длинные и короткие позиции юридических лиц.', false, true],
  ['persons-fiz', 'FUTOI число лиц физлица', 'Количество физических лиц с открытыми позициями.', false, true],
  ['persons-yur', 'FUTOI число лиц юрлица', 'Количество юридических лиц с открытыми позициями.', false, true],
  ['oi-fiz', 'FUTOI открытый интерес физлица', 'Сумма длинных и коротких позиций физических лиц.', false, true],
  ['oi-yur', 'FUTOI открытый интерес юрлица', 'Сумма длинных и коротких позиций юридических лиц.', false, true],
  ['directed-fiz', 'FUTOI направленная физлица', 'Направленная позиция физических лиц (long − short).', false, true],
  ['directed-yur', 'FUTOI направленная юрлица', 'Направленная позиция юридических лиц (long − short).', false, true],
  ['dashboard', 'FUTOI обзор', 'Таблица и все графики открытых позиций в одном виджете.', true, true],
];

function topics(publishes, subscribes) {
  const result = { publishes: [], subscribes: [] };
  if (publishes) {
    result.publishes.push({ topicType: FILTER_TOPIC }, { topicType: 'fdc3.instrument' });
  }
  if (subscribes) {
    result.subscribes.push(
      { topicType: FILTER_TOPIC },
      { topicType: 'fdc3.instrument' },
      { topicType: 'finamx.timeframe' },
    );
  }
  if (publishes && !subscribes) {
    result.subscribes.push({ topicType: 'fdc3.instrument' }, { topicType: 'finamx.timeframe' });
  }
  return result;
}

async function pageSha256(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot hash ${url} (${res.status})`);
  return createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
}

mkdirSync(outDir, { recursive: true });

const pin = bundle.startsWith('https://');

for (const [slug, title, description, publishes, subscribes] of WIDGETS) {
  const embedEntryPath = `/widgets/${slug}${entrySuffix}`;
  const pageUrl = new URL(embedEntryPath, bundle).href;
  const integrity = pin ? { bundleSha256: await pageSha256(pageUrl) } : undefined;
  const manifest = {
    extensionId: `com.finamx.algopack.futoi.${slug}`,
    displayName: title,
    description,
    visibility: 'public',
    platformSupport: ['web'],
    versions: [
      {
        version: '1.0.3',
        changelog: 'BFF на VPS; с графика убраны печати 23:40 и 23:50 (хвост закрытия сессии)',
        capabilitiesRequested: ['user.profile.read', 'ui.toast'],
        ...(integrity ? { integrity } : {}),
        surfaces: {
          ui: {
            renderMode: 'external-embed',
            embedBundleUrl: bundle,
            embedEntryPath,
            embedSandbox: 'allow-scripts allow-popups',
          },
          topics: topics(publishes, subscribes),
        },
      },
    ],
  };
  writeFileSync(join(outDir, `${slug}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
}

copyFileSync(join(outDir, 'dashboard.json'), join(root, 'manifest.json'));
console.log(`wrote ${WIDGETS.length} manifests → ${bundle}${pin ? ' (sha256 pinned)' : ''}`);
