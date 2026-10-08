import { fixtureSeries, fixtureSnapshot } from './fixture';
import { MoexError, statusFromHttp } from './errors';
import {
  ASSET_NAMES,
  DEFAULT_UNIVERSE,
  emptyMetrics,
  metricsFromRow,
  type ClGroup,
  type FutoiRow,
  type Lookback,
  type PricePoint,
  type SeriesPoint,
  type SnapshotBlock,
  type SnapshotResponse,
  type UniverseItem,
} from './types';

const APIM = 'https://apim.moex.com';
const ISS = 'https://iss.moex.com';

type CacheEntry<T> = { at: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_MS = 45_000;
const g = globalThis as typeof globalThis & { __futoiDownUntil?: number };

function markUpstreamDown(): void {
  g.__futoiDownUntil = Date.now() + 60_000;
}

function upstreamDown(): boolean {
  return Date.now() < (g.__futoiDownUntil ?? 0);
}

let requestBearer = '';

export function setRequestBearer(token: string): void {
  requestBearer = token;
}

function token(): string {
  return requestBearer || (process.env.ALGOPACK_TOKEN ?? '');
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function lookbackRange(lookback: Lookback | undefined, sessionDate?: string): { from: string; to: string } {
  const to = sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : todayISO();
  if (lookback === '20d') return { from: addDays(to, -20), to };
  if (lookback === '5d') return { from: addDays(to, -5), to };
  return { from: to, to };
}

async function fetchJson(url: string, auth: boolean): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth && token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new MoexError(statusFromHttp(res.status), `upstream ${res.status}`);
  }
  return res.json();
}

function tableFromIss(payload: unknown, candidates: string[]): { columns: string[]; data: unknown[][] } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  for (const name of candidates) {
    const block = root[name];
    if (!block || typeof block !== 'object') continue;
    const node = block as Record<string, unknown>;
    const inner = (node.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? (node.data as Record<string, unknown>)
      : node) as Record<string, unknown>;
    const columns = inner.columns;
    const data = inner.data;
    if (Array.isArray(columns) && Array.isArray(data)) {
      return { columns: columns.map(String), data: data as unknown[][] };
    }
  }
  return null;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function normalizeGroup(raw: string): ClGroup | null {
  const s = raw.trim().toUpperCase();
  if (s === 'FIZ' || s.startsWith('ФИЗ') || s.includes('PHYS')) return 'FIZ';
  if (s === 'YUR' || s.startsWith('ЮР') || s.includes('LEGAL') || s.includes('JUR')) return 'YUR';
  return null;
}

function colIndex(columns: string[], names: string[]): number {
  const lower = columns.map((c) => c.toLowerCase());
  for (const name of names) {
    const i = lower.indexOf(name.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function parseFutoiTable(table: { columns: string[]; data: unknown[][] }): FutoiRow[] {
  const c = table.columns;
  const iTicker = colIndex(c, ['ticker', 'secid', 'asset_code', 'code']);
  const iDate = colIndex(c, ['tradedate', 'trade_date', 'date']);
  const iTime = colIndex(c, ['tradetime', 'trade_time', 'time', 'systime']);
  const iGroup = colIndex(c, ['clgroup', 'cl_group', 'client_type', 'ctype']);
  const iLong = colIndex(c, ['pos_long', 'poslong', 'long']);
  const iShort = colIndex(c, ['pos_short', 'posshort', 'short']);
  const iLongN = colIndex(c, ['pos_long_num', 'poslongnum', 'long_num']);
  const iShortN = colIndex(c, ['pos_short_num', 'posshortnum', 'short_num']);
  if (iTicker < 0 || iGroup < 0 || iLong < 0 || iShort < 0) return [];

  const rows: FutoiRow[] = [];
  for (const line of table.data) {
    const group = normalizeGroup(str(line[iGroup]));
    if (!group) continue;
    rows.push({
      ticker: str(line[iTicker]),
      tradedate: str(iDate >= 0 ? line[iDate] : ''),
      tradetime: str(iTime >= 0 ? line[iTime] : ''),
      clgroup: group,
      posLong: num(line[iLong]),
      posShort: num(line[iShort]),
      posLongNum: iLongN >= 0 ? num(line[iLongN]) : 0,
      posShortNum: iShortN >= 0 ? num(line[iShortN]) : 0,
    });
  }
  return rows;
}

function parsePriceTable(table: { columns: string[]; data: unknown[][] }): PricePoint[] {
  const c = table.columns;
  const iBegin = colIndex(c, ['begin', 'tradedate', 'datetime', 'end']);
  const iTime = colIndex(c, ['tradetime', 'time']);
  const iClose = colIndex(c, ['close', 'pr_close', 'pr_last', 'last', 'price']);
  if (iClose < 0) return [];
  return table.data
    .map((line) => {
      const date = iBegin >= 0 ? str(line[iBegin]) : '';
      const time = iTime >= 0 ? str(line[iTime]) : '';
      const ts = time && date && !date.includes(':') ? `${date}T${time}` : date;
      return { ts, price: num(line[iClose]) };
    })
    .filter((p) => p.ts && p.price > 0);
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function loadFutoiDay(date: string, secid?: string): Promise<FutoiRow[]> {
  const q = new URLSearchParams({
    'iss.meta': 'off',
    date,
  });
  const path = secid ? `fo/futoi/${encodeURIComponent(secid)}.json` : 'fo/futoi.json';
  const urls = [
    { url: `${APIM}/iss/datashop/algopack/${path}?${q}`, auth: true },
    {
      url: `${ISS}/iss/analyticalproducts/futoi/securities${secid ? `/${encodeURIComponent(secid)}` : ''}.json?${q}`,
      auth: false,
    },
  ];
  let last: unknown;
  for (const u of urls) {
    try {
      const json = await fetchJson(u.url, u.auth);
      const table = tableFromIss(json, ['futoi', 'securities', 'data']);
      if (!table) continue;
      const rows = parseFutoiTable(table);
      if (rows.length) {
        return secid
          ? rows.filter((r) => r.ticker.toLowerCase() === secid.toLowerCase())
          : rows;
      }
    } catch (err) {
      last = err;
      if (err instanceof MoexError && err.kind === 'subscription_expired') throw err;
    }
  }
  if (last instanceof MoexError) throw last;
  if (last) {
    markUpstreamDown();
    throw new MoexError('upstream_error', 'moex unreachable');
  }
  return [];
}

async function loadPrices(secid: string, from: string, to: string): Promise<PricePoint[]> {
  const q = new URLSearchParams({
    'iss.meta': 'off',
    from,
    till: to,
    interval: '5',
  });
  const urls = [
    {
      url: `${APIM}/iss/datashop/algopack/fo/tradestats/${encodeURIComponent(secid)}.json?${q}`,
      auth: true,
    },
    {
      url: `${ISS}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(secid)}/candles.json?${q}`,
      auth: false,
    },
  ];
  for (const u of urls) {
    try {
      const json = await fetchJson(u.url, u.auth);
      const table = tableFromIss(json, ['candles', 'tradestats', 'data']);
      if (!table) continue;
      const points = parsePriceTable(table);
      if (points.length) return points;
    } catch {
      // next
    }
  }
  return [];
}

function rowTs(row: FutoiRow): string {
  if (row.tradedate && row.tradetime) return `${row.tradedate}T${row.tradetime}`;
  return row.tradedate || row.tradetime;
}

function toBlock(fiz?: FutoiRow, yur?: FutoiRow): SnapshotBlock | null {
  if (!fiz && !yur) return null;
  const src = fiz ?? yur!;
  return {
    tradedate: src.tradedate,
    tradetime: src.tradetime,
    fizLong: fiz?.posLong ?? 0,
    fizShort: fiz?.posShort ?? 0,
    yurLong: yur?.posLong ?? 0,
    yurShort: yur?.posShort ?? 0,
    fizLongNum: fiz?.posLongNum ?? 0,
    fizShortNum: fiz?.posShortNum ?? 0,
    yurLongNum: yur?.posLongNum ?? 0,
    yurShortNum: yur?.posShortNum ?? 0,
    totalOi:
      (fiz?.posLong ?? 0) +
      (fiz?.posShort ?? 0) +
      (yur?.posLong ?? 0) +
      (yur?.posShort ?? 0),
  };
}

function minusBlock(a: SnapshotBlock, b: SnapshotBlock): SnapshotBlock {
  return {
    tradedate: a.tradedate,
    tradetime: a.tradetime,
    fizLong: a.fizLong - b.fizLong,
    fizShort: a.fizShort - b.fizShort,
    yurLong: a.yurLong - b.yurLong,
    yurShort: a.yurShort - b.yurShort,
    fizLongNum: a.fizLongNum - b.fizLongNum,
    fizShortNum: a.fizShortNum - b.fizShortNum,
    yurLongNum: a.yurLongNum - b.yurLongNum,
    yurShortNum: a.yurShortNum - b.yurShortNum,
    totalOi: a.totalOi - b.totalOi,
  };
}

function latestPair(rows: FutoiRow[]): { fiz?: FutoiRow; yur?: FutoiRow } {
  const sorted = [...rows].sort((a, b) => rowTs(a).localeCompare(rowTs(b)));
  let fiz: FutoiRow | undefined;
  let yur: FutoiRow | undefined;
  for (const row of sorted) {
    if (row.clgroup === 'FIZ') fiz = row;
    if (row.clgroup === 'YUR') yur = row;
  }
  return { fiz, yur };
}

function closePair(rows: FutoiRow[]): { fiz?: FutoiRow; yur?: FutoiRow } {
  const target = rows.filter((r) => r.tradetime.startsWith('23:50') || r.tradetime.startsWith('18:50'));
  return latestPair(target.length ? target : rows);
}

export async function probeToken(bearer: string): Promise<'ok' | 'subscription_expired' | 'upstream_error'> {
  const q = new URLSearchParams({ 'iss.meta': 'off', date: todayISO() });
  try {
    await fetchJson(`${APIM}/iss/datashop/algopack/fo/futoi.json?${q}`, true);
    return 'ok';
  } catch (err) {
    if (err instanceof MoexError) return err.kind === 'subscription_expired' ? 'subscription_expired' : 'upstream_error';
    return 'upstream_error';
  }
}

export async function getUniverse(): Promise<UniverseItem[]> {
  if (upstreamDown()) {
    return DEFAULT_UNIVERSE.map((secid) => ({ secid, assetName: ASSET_NAMES[secid] ?? secid }));
  }
  return cached('universe', async () => {
    try {
      const rows = await loadFutoiDay(todayISO());
      const tickers = new Set<string>(DEFAULT_UNIVERSE);
      for (const row of rows) {
        if (row.ticker) tickers.add(row.ticker);
      }
      return [...tickers].sort().map((secid) => ({
        secid,
        assetName: ASSET_NAMES[secid] ?? secid,
      }));
    } catch {
      markUpstreamDown();
      return DEFAULT_UNIVERSE.map((secid) => ({ secid, assetName: ASSET_NAMES[secid] ?? secid }));
    }
  });
}

export function isKnownSecid(secid: string, universe: UniverseItem[]): boolean {
  return universe.some((u) => u.secid.toLowerCase() === secid.toLowerCase());
}

async function buildSeries(secid: string, from: string, to: string): Promise<SeriesPoint[]> {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const rows = (
    await Promise.all(dates.map((date) => cached(`futoi:${secid}:${date}`, () => loadFutoiDay(date, secid))))
  ).flat();
  const prices = await cached(`px:${secid}:${from}:${to}`, () => loadPrices(secid, from, to));
  const priceByTs = new Map(prices.map((p) => [p.ts.slice(0, 16), p.price]));

  const byTs = new Map<string, { fiz?: FutoiRow; yur?: FutoiRow }>();
  for (const row of rows) {
    const ts = rowTs(row);
    const slot = byTs.get(ts) ?? {};
    if (row.clgroup === 'FIZ') slot.fiz = row;
    else slot.yur = row;
    byTs.set(ts, slot);
  }

  const points: SeriesPoint[] = [];
  for (const [ts, slot] of [...byTs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    points.push({
      ts,
      price: priceByTs.get(ts.slice(0, 16)) ?? null,
      fiz: slot.fiz ? metricsFromRow(slot.fiz) : emptyMetrics(),
      yur: slot.yur ? metricsFromRow(slot.yur) : emptyMetrics(),
    });
  }
  if (points.length && points.every((p) => p.price == null) && prices.length) {
    for (const p of points) {
      const hit = prices.find((x) => x.ts.slice(0, 10) === p.ts.slice(0, 10));
      if (hit) p.price = hit.price;
    }
  }
  return points;
}

async function lastSessionWithRows(secid: string, start: string): Promise<string | null> {
  let date = start;
  for (let i = 0; i < 7; i += 1) {
    const rows = await cached(`futoi:${secid}:${date}`, () => loadFutoiDay(date, secid));
    if (rows.length) return date;
    date = addDays(date, -1);
  }
  return null;
}

export async function getSnapshot(secid: string): Promise<SnapshotResponse> {
  const to = todayISO();
  if (upstreamDown()) return fixtureSnapshot(secid, to);
  try {
    const session = (await lastSessionWithRows(secid, to)) ?? to;
    const prev = addDays(session, -1);
    const [todayRows, yRows] = await Promise.all([
      cached(`futoi:${secid}:${session}`, () => loadFutoiDay(session, secid)),
      cached(`futoi:${secid}:${prev}`, () => loadFutoiDay(prev, secid)),
    ]);
    const pair = latestPair(todayRows);
    const cur = toBlock(pair.fiz, pair.yur);
    if (cur) {
      const prevPair = closePair(yRows);
      const previousClose = toBlock(prevPair.fiz, prevPair.yur);
      return {
        secid,
        assetName: ASSET_NAMES[secid] ?? secid,
        current: cur,
        previousClose,
        deltaContracts: previousClose ? minusBlock(cur, previousClose) : null,
        deltaPersons: previousClose ? minusBlock(cur, previousClose) : null,
      };
    }
  } catch (err) {
    if (err instanceof MoexError && err.kind === 'subscription_expired') throw err;
  }
  return fixtureSnapshot(secid, to);
}

export async function getSeries(
  secid: string,
  from: string,
  to: string,
): Promise<{ points: SeriesPoint[]; stale?: boolean }> {
  if (upstreamDown()) return { points: fixtureSeries(secid, to), stale: true };
  try {
    const points = await buildSeries(secid, from, to);
    if (points.length) return { points };
    const session = await lastSessionWithRows(secid, to);
    if (session) {
      const fallback = await buildSeries(secid, session, session);
      if (fallback.length) return { points: fallback };
    }
  } catch (err) {
    if (err instanceof MoexError && err.kind === 'subscription_expired') throw err;
  }
  return { points: fixtureSeries(secid, to), stale: true };
}

export function assetName(secid: string): string {
  return ASSET_NAMES[secid] ?? secid;
}
