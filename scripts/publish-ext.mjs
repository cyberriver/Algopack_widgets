import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = (process.env.FINAMX_API_URL ?? 'https://openplatform.changesandbox.ru').replace(/\/$/, '');

function loadDotEnv() {
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i);
      const v = t.slice(i + 1);
      if (process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();
const token = (process.env.FINAMX_DEV_TOKEN ?? '').trim();
if (!token) {
  console.error('FINAMX_DEV_TOKEN missing');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

const files = readdirSync(join(root, 'manifests')).filter((f) => f.endsWith('.json')).sort();
const listed = await call('GET', '/api/v1/developer/extensions');
const owned = new Set((listed.json.items ?? []).map((i) => i.extensionId));
console.log(`portal ${listed.status} owned=${owned.size}`);

for (const file of files) {
  const manifest = JSON.parse(readFileSync(join(root, 'manifests', file), 'utf8'));
  const id = manifest.extensionId;
  const version = manifest.versions.at(-1);
  const exists = owned.has(id);
  let result = exists
    ? await call('POST', `/api/v1/developer/extensions/${encodeURIComponent(id)}/versions`, version)
    : await call('POST', '/api/v1/developer/extensions', manifest);
  if (!exists && result.status === 409 && result.json?.error === 'EXTENSION_EXISTS') {
    result = await call('POST', `/api/v1/developer/extensions/${encodeURIComponent(id)}/versions`, version);
  }
  const err = result.json?.error ?? result.json?.code ?? result.json?.message ?? '';
  console.log(`${id} ${version.version} http=${result.status} ${err}`.trim());
}
