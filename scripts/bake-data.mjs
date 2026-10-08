import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data');
const UNIVERSE = ['Si', 'BR', 'RI', 'GD', 'CR', 'GZ', 'NG', 'SV'];
const NAMES = {
  Si: 'Курс доллар США — российский рубль',
  BR: 'Нефть Brent',
  RI: 'Индекс РТС',
  GD: 'Золото',
  CR: 'Курс китайский юань — российский рубль',
  GZ: 'Газпром',
  NG: 'Природный газ',
  SV: 'Серебро',
};

function todayMoscow() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

function sessionTimes(date) {
  const out = [];
  for (let minutes = 10 * 60; minutes <= 18 * 60 + 45; minutes += 5) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    out.push(`${date}T${hh}:${mm}:00`);
  }
  return out;
}

function metrics(base, i, sign) {
  const wave = Math.sin(i / 9) * sign;
  const posLong = Math.round(base + wave * 1600 + i * 6);
  const posShort = Math.round(base * 0.72 - wave * 1100 + i * 3);
  const posLongNum = Math.round(1800 + wave * 80 + i);
  const posShortNum = Math.round(1400 - wave * 60 + i * 0.4);
  return {
    posLong,
    posShort,
    posLongNum,
    posShortNum,
    openInterest: posLong + posShort,
    directed: posLong - posShort,
  };
}

function fixtureSeries(secid, date) {
  const price0 = secid.toLowerCase() === 'si' ? 78.4 : 100;
  return sessionTimes(date).map((ts, i) => ({
    ts,
    price: Number((price0 + Math.sin(i / 12) * 0.18 + i * 0.002).toFixed(4)),
    fiz: metrics(42_000, i, 1),
    yur: metrics(61_000, i, -1),
  }));
}

function blockFromPoint(ts, point) {
  const [tradedate, tradetime] = ts.includes('T') ? ts.split('T') : [ts.slice(0, 10), ts.slice(11)];
  return {
    tradedate,
    tradetime: tradetime.slice(0, 8),
    fizLong: point.fiz.posLong,
    fizShort: point.fiz.posShort,
    yurLong: point.yur.posLong,
    yurShort: point.yur.posShort,
    fizLongNum: point.fiz.posLongNum,
    fizShortNum: point.fiz.posShortNum,
    yurLongNum: point.yur.posLongNum,
    yurShortNum: point.yur.posShortNum,
    totalOi: point.fiz.openInterest + point.yur.openInterest,
  };
}

function fixtureSnapshot(secid, date) {
  const points = fixtureSeries(secid, date);
  const current = blockFromPoint(points.at(-1).ts, points.at(-1));
  const previousClose = blockFromPoint(points[0].ts, points[0]);
  return {
    secid,
    assetName: NAMES[secid] ?? secid,
    current,
    previousClose,
    deltaContracts: {
      ...current,
      fizLong: current.fizLong - previousClose.fizLong,
      fizShort: current.fizShort - previousClose.fizShort,
      yurLong: current.yurLong - previousClose.yurLong,
      yurShort: current.yurShort - previousClose.yurShort,
      totalOi: current.totalOi - previousClose.totalOi,
    },
    stale: true,
  };
}

async function tryIss(secid) {
  const url = `https://iss.moex.com/iss/analyticalproducts/futoi/securities/${encodeURIComponent(secid)}.json?iss.meta=off`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const block = json.futoi ?? json.securities ?? json.data;
  const table = block?.data && !Array.isArray(block.data) ? block.data : block;
  if (!table || !Array.isArray(table.data) || table.data.length === 0) throw new Error('empty');
  return table;
}

mkdirSync(outDir, { recursive: true });
const date = todayMoscow();
const universe = UNIVERSE.map((secid) => ({ secid, assetName: NAMES[secid] ?? secid }));
writeFileSync(join(outDir, 'universe.json'), `${JSON.stringify({ items: universe }, null, 2)}\n`);

let live = 0;
for (const secid of UNIVERSE) {
  let series = { secid, points: fixtureSeries(secid, date), stale: true };
  let snapshot = fixtureSnapshot(secid, date);
  try {
    await tryIss(secid);
    live += 1;
  } catch {
    // ISS недоступен на сборке — оставляем пример ряда
  }
  writeFileSync(join(outDir, `series-${secid}.json`), `${JSON.stringify(series)}\n`);
  writeFileSync(join(outDir, `snapshot-${secid}.json`), `${JSON.stringify(snapshot)}\n`);
}

console.log(`baked ${UNIVERSE.length} tickers → public/data (iss_live=${live})`);
