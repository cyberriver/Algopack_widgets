import { emptyMetrics, metricsFromRow, type ClGroup, type FutoiRow, type SeriesPoint, type SnapshotBlock, type SnapshotResponse } from './types';
import { ASSET_NAMES } from './types';

const APIM = 'https://apim.moex.com';
const ISS = 'https://iss.moex.com';

export type BrowserLoadError = 'subscription_expired' | 'cors_or_network' | 'empty';

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    if (Array.isArray(inner.columns) && Array.isArray(inner.data)) {
      return { columns: inner.columns.map(String), data: inner.data as unknown[][] };
    }
  }
  return null;
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

async function fetchJson(url: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('subscription_expired');
    err.name = 'MoexAuth';
    throw err;
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

async function loadDay(date: string, secid: string, token: string): Promise<FutoiRow[]> {
  const q = new URLSearchParams({ 'iss.meta': 'off', date });
  const urls: Array<{ url: string; auth: boolean }> = [];
  if (token) {
    urls.push({ url: `${APIM}/iss/datashop/algopack/fo/futoi/${encodeURIComponent(secid)}.json?${q}`, auth: true });
  }
  urls.push({
    url: `${ISS}/iss/analyticalproducts/futoi/securities/${encodeURIComponent(secid)}.json?${q}`,
    auth: false,
  });
  let authFail = false;
  for (const item of urls) {
    try {
      const json = await fetchJson(item.url, item.auth ? token : undefined);
      const table = tableFromIss(json, ['futoi', 'securities', 'data']);
      if (!table) continue;
      const rows = parseFutoiTable(table).filter((r) => r.ticker.toLowerCase() === secid.toLowerCase());
      if (rows.length) return rows;
    } catch (err) {
      if (err instanceof Error && err.name === 'MoexAuth') authFail = true;
    }
  }
  if (authFail) {
    const err = new Error('subscription_expired');
    err.name = 'MoexAuth';
    throw err;
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
    totalOi: (fiz?.posLong ?? 0) + (fiz?.posShort ?? 0) + (yur?.posLong ?? 0) + (yur?.posShort ?? 0),
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

function toPoints(rows: FutoiRow[]): SeriesPoint[] {
  const byTs = new Map<string, { fiz?: FutoiRow; yur?: FutoiRow }>();
  for (const row of rows) {
    const ts = rowTs(row);
    const slot = byTs.get(ts) ?? {};
    if (row.clgroup === 'FIZ') slot.fiz = row;
    else slot.yur = row;
    byTs.set(ts, slot);
  }
  return [...byTs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, slot]) => ({
      ts,
      price: null,
      fiz: slot.fiz ? metricsFromRow(slot.fiz) : emptyMetrics(),
      yur: slot.yur ? metricsFromRow(slot.yur) : emptyMetrics(),
    }));
}

export async function probeBrowserToken(token: string): Promise<'ok' | 'subscription_expired' | 'cors_or_network'> {
  try {
    const rows = await loadDay(todayISO(), 'Si', token);
    if (rows.length) return 'ok';
    return 'ok';
  } catch (err) {
    if (err instanceof Error && err.name === 'MoexAuth') return 'subscription_expired';
    return 'cors_or_network';
  }
}

export async function loadBrowserSeries(
  secid: string,
  token: string,
): Promise<{ points: SeriesPoint[]; error?: BrowserLoadError }> {
  try {
    let date = todayISO();
    for (let i = 0; i < 5; i += 1) {
      const rows = await loadDay(date, secid, token);
      const points = toPoints(rows);
      if (points.length) return { points };
      date = addDays(date, -1);
    }
    return { points: [], error: 'empty' };
  } catch (err) {
    if (err instanceof Error && err.name === 'MoexAuth') return { points: [], error: 'subscription_expired' };
    return { points: [], error: 'cors_or_network' };
  }
}

export async function loadBrowserSnapshot(
  secid: string,
  token: string,
): Promise<{ snapshot: SnapshotResponse | null; error?: BrowserLoadError }> {
  try {
    let date = todayISO();
    for (let i = 0; i < 5; i += 1) {
      const rows = await loadDay(date, secid, token);
      const pair = latestPair(rows);
      const current = toBlock(pair.fiz, pair.yur);
      if (current) {
        return {
          snapshot: {
            secid,
            assetName: ASSET_NAMES[secid] ?? secid,
            current,
            previousClose: null,
            deltaContracts: null,
            deltaPersons: null,
          },
        };
      }
      date = addDays(date, -1);
    }
    return { snapshot: null, error: 'empty' };
  } catch (err) {
    if (err instanceof Error && err.name === 'MoexAuth') return { snapshot: null, error: 'subscription_expired' };
    return { snapshot: null, error: 'cors_or_network' };
  }
}
