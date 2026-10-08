import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'src/app/api');
const parked = join(root, '.api-tmp');

if (existsSync(api)) renameSync(api, parked);

const env = {
  ...process.env,
  STATIC_EXPORT: '1',
  NEXT_PUBLIC_STATIC: '1',
  BASE_PATH: process.env.BASE_PATH ?? '/Algopack_widgets',
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? '/Algopack_widgets',
};

try {
  const result = spawnSync('npx', ['next', 'build'], { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  if (existsSync(parked)) renameSync(parked, api);
}
