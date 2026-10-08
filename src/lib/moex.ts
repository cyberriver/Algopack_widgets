import https from 'node:https';
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

export function clearUpstreamDown(): void {
  g.__futoiDownUntil = 0;
}

function upstreamDown(): boolean {
  return false;
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
  if (lookback === '60d') return { from: addDays(to, -60), to };
  if (lookback === '20d') return { from: addDays(to, -20), to };
  if (lookback === '5d') return { from: addDays(to, -5), to };
  return { from: to, to };
}

/** Corp TLS inspection: Node CA store rejects MOEX, the browser does not. */
function fetchMoex(url: string, headers: Record<string, string>): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'GET', headers, rejectUnauthorized: false, timeout: 12_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 502,
              headers: { 'content-type': res.headers['content-type'] ?? 'application/json' },
            }),
          );
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('moex timeout'));
    });
    req.end();
  });
}

async function fetchJson(url: string, auth: boolean): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth && token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetchMoex(url, headers);
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
      const cols = columns.map(String);
      if (cols.length === 1 && cols[0].toLowerCase() === 'error_message') {
        const message = data[0] != null ? String((data[0] as unknown[])[0] ?? 'futoi error') : 'futoi error';
        throw new MoexError('upstream_error', message);
      }
      return { columns: cols, data: data as unknown[][] };
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
      posLong: Math.abs(num(line[iLong])),
      posShort: Math.abs(num(line[iShort])),
      posLongNum: iLongN >= 0 ? num(line[iLongN]) : 0,
      posShortNum: iShortN >= 0 ? num(line[iShortN]) : 0,
    });
  }
  return rows;
}

function minuteKey(ts: string): string {
  const m = ts.replace(' ', 'T').match(/(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[1]}T${m[2]}:${m[3]}` : '';
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
      const raw = time && date && !date.includes(':') ? `${date}T${time}` : date.replace(' ', 'T');
      return { ts: raw, price: num(line[iClose]) };
    })
    .filter((p) => minuteKey(p.ts) && p.price > 0);
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function futoiSecuritiesPath(secid?: string): string {
  const suffix = secid ? `/${encodeURIComponent(secid)}` : '';
  return `/iss/analyticalproducts/futoi/securities${suffix}.json`;
}

async function loadFutoiDay(date: string, secid?: string): Promise<FutoiRow[]> {
  const q = new URLSearchParams({ 'iss.meta': 'off' });
  if (secid) {
    q.set('from', date);
    q.set('till', date);
  } else {
    q.set('date', date);
  }
  const path = futoiSecuritiesPath(secid);
  const urls = [
    { url: `${APIM}${path}?${q}`, auth: true },
    { url: `${ISS}${path}?${q}`, auth: true },
    { url: `${ISS}${path}?${q}`, auth: false },
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
  if (last) throw new MoexError('upstream_error', 'moex unreachable');
  return [];
}

function contractPoints(price: number): number {
  if (price <= 0) return price;
  return price < 1000 ? Math.round(price * 1000) : price;
}

function isAssetFuture(secid: string, assetCode: string, asset: string): boolean {
  const a = asset.toUpperCase();
  if (assetCode.toUpperCase() === a) return true;
  return new RegExp(`^${a}[FGHJKMNQUVXZ]\\d{1,2}$`, 'i').test(secid);
}

async function resolveFrontMonth(asset: string): Promise<string> {
  return cached(`front:${asset}`, async () => {
    const q = new URLSearchParams({
      'iss.meta': 'off',
      'iss.only': 'securities,marketdata',
      'securities.columns': 'SECID,ASSETCODE,LASTDELDATE,STATUS',
      'marketdata.columns': 'SECID,LAST',
    });
    const urls = [
      `${ISS}/iss/engines/futures/markets/forts/securities.json?${q}`,
      `${APIM}/iss/engines/futures/markets/forts/securities.json?${q}`,
    ];
    for (const url of urls) {
      try {
        const json = await fetchJson(url, url.startsWith(APIM));
        const table = tableFromIss(json, ['securities']);
        const md = tableFromIss(json, ['marketdata']);
        if (!table) continue;
        const lastBySec = new Map<string, number>();
        if (md) {
          const iSec = colIndex(md.columns, ['secid']);
          const iLast = colIndex(md.columns, ['last']);
          for (const line of md.data) {
            const id = str(iSec >= 0 ? line[iSec] : '');
            const last = iLast >= 0 ? num(line[iLast]) : 0;
            if (id && last > 0) lastBySec.set(id, last);
          }
        }
        const iSec = colIndex(table.columns, ['secid']);
        const iAsset = colIndex(table.columns, ['assetcode', 'asset']);
        const iExp = colIndex(table.columns, ['lastdeldate', 'lasttradedate']);
        const iStat = colIndex(table.columns, ['status']);
        const today = todayISO();
        const matches = table.data
          .map((line) => {
            const secid = str(iSec >= 0 ? line[iSec] : '');
            return {
              secid,
              asset: str(iAsset >= 0 ? line[iAsset] : ''),
              exp: str(iExp >= 0 ? line[iExp] : '9999-12-31'),
              status: str(iStat >= 0 ? line[iStat] : ''),
              last: lastBySec.get(secid) ?? 0,
            };
          })
          .filter((r) => isAssetFuture(r.secid, r.asset, asset))
          .filter((r) => r.status === '' || r.status === 'A' || r.status === 'T')
          .filter((r) => !r.exp || r.exp >= today)
          .sort((a, b) => {
            if (a.last > 0 !== b.last > 0) return a.last > 0 ? -1 : 1;
            return a.exp.localeCompare(b.exp);
          });
        if (matches[0]?.secid) return matches[0].secid;
      } catch {
        // next
      }
    }
    return asset;
  });
}

async function loadLastPrice(front: string): Promise<number | null> {
  const q = new URLSearchParams({
    'iss.meta': 'off',
    'iss.only': 'marketdata',
    'marketdata.columns': 'SECID,LAST',
  });
  const urls = [
    `${ISS}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(front)}.json?${q}`,
    `${APIM}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(front)}.json?${q}`,
  ];
  for (const url of urls) {
    try {
      const json = await fetchJson(url, url.startsWith(APIM));
      const table = tableFromIss(json, ['marketdata']);
      if (!table) continue;
      const iLast = colIndex(table.columns, ['last']);
      if (iLast < 0 || !table.data[0]) continue;
      const last = contractPoints(num(table.data[0][iLast]));
      if (last > 0) return last;
    } catch {
      // next
    }
  }
  return null;
}

async function loadPrices(secid: string, from: string, to: string): Promise<PricePoint[]> {
  const front = await resolveFrontMonth(secid);
  const q = new URLSearchParams({
    'iss.meta': 'off',
    from,
    till: to,
    interval: '10',
  });
  const urls = [
    { url: `${ISS}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(front)}/candles.json?${q}`, auth: false },
    { url: `${APIM}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(front)}/candles.json?${q}`, auth: true },
  ];
  let points: PricePoint[] = [];
  for (const u of urls) {
    try {
      const json = await fetchJson(u.url, u.auth);
      const table = tableFromIss(json, ['candles', 'data']);
      if (!table) continue;
      points = parsePriceTable(table).map((p) => ({ ...p, price: contractPoints(p.price) }));
      if (points.length) break;
    } catch {
      // next
    }
  }
  const last = await loadLastPrice(front);
  if (last && points.length) {
    const tail = points[points.length - 1];
    points[points.length - 1] = { ...tail, price: last };
  } else if (last && !points.length) {
    points = [{ ts: `${to}T23:30:00`, price: last }];
  }
  return points;
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
  const day = todayISO();
  const q = new URLSearchParams({ 'iss.meta': 'off', from: day, till: day });
  setRequestBearer(bearer);
  try {
    await fetchJson(`${APIM}${futoiSecuritiesPath('Si')}?${q}`, true);
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
      return DEFAULT_UNIVERSE.map((secid) => ({ secid, assetName: ASSET_NAMES[secid] ?? secid }));
    }
  });
}

export function isKnownSecid(secid: string, universe: UniverseItem[]): boolean {
  return universe.some((u) => u.secid.toLowerCase() === secid.toLowerCase());
}

async function buildSeries(
  secid: string,
  from: string,
  to: string,
  opts: { skipPrices?: boolean } = {},
): Promise<SeriesPoint[]> {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const rows = (
    await Promise.all(dates.map((date) => cached(`futoi:${secid}:${date}`, () => loadFutoiDay(date, secid))))
  ).flat();
  let prices: PricePoint[] = [];
  if (!opts.skipPrices) {
    try {
      prices = await cached(`px:${secid}:${from}:${to}`, () => loadPrices(secid, from, to));
    } catch {
      prices = [];
    }
  }
  const priceByTs = new Map(prices.map((p) => [minuteKey(p.ts), p.price]));

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
    const hhmm = ts.slice(11, 16);
    if (hhmm === '23:40' || hhmm === '23:50') continue;
    points.push({
      ts,
      price: priceByTs.get(minuteKey(ts)) ?? null,
      fiz: slot.fiz ? metricsFromRow(slot.fiz) : emptyMetrics(),
      yur: slot.yur ? metricsFromRow(slot.yur) : emptyMetrics(),
    });
  }
  if (points.length && prices.length) {
    const lastPx = prices[prices.length - 1]?.price;
    if (lastPx && points[points.length - 1].price == null) points[points.length - 1].price = lastPx;
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

export async function getSnapshot(secid: string, opts: { quick?: boolean } = {}): Promise<SnapshotResponse> {
  const to = todayISO();
  if (upstreamDown()) throw new MoexError('upstream_error', 'moex marked down');
  const session = opts.quick ? to : ((await lastSessionWithRows(secid, to)) ?? to);
  const prev = addDays(session, -1);
  const [todayRows, yRows] = await Promise.all([
    cached(`futoi:${secid}:${session}`, () => loadFutoiDay(session, secid)),
    opts.quick
      ? Promise.resolve([] as FutoiRow[])
      : cached(`futoi:${secid}:${prev}`, () => loadFutoiDay(prev, secid)),
  ]);
  const pair = latestPair(todayRows);
  const cur = toBlock(pair.fiz, pair.yur);
  if (!cur) throw new MoexError('upstream_error', 'empty futoi snapshot');
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

export async function getSeries(
  secid: string,
  from: string,
  to: string,
  opts: { quick?: boolean } = {},
): Promise<{ points: SeriesPoint[]; stale?: boolean }> {
  if (upstreamDown()) throw new MoexError('upstream_error', 'moex marked down');
  const points = await buildSeries(secid, from, to, { skipPrices: false });
  if (points.length) return { points };
  if (!opts.quick) {
    const session = await lastSessionWithRows(secid, to);
    if (session) {
      const fallback = await buildSeries(secid, session, session);
      if (fallback.length) return { points: fallback };
    }
  }
  return { points: [] };
}

export function assetName(secid: string): string {
  return ASSET_NAMES[secid] ?? secid;
}
