import type { OhlcBar } from '@/lib/moex';
import type { SeriesPoint } from '@/lib/types';
import { tsOf } from './join';
import { formatMmSs } from './time';
import type { Lamp, Readiness } from './types';

function ageMinFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 60_000;
}

function lamp(age: number | null, green: number, yellow: number, missing: Lamp): Lamp {
  if (age == null) return missing;
  if (age <= green) return 'green';
  if (age <= yellow) return 'yellow';
  return 'red';
}

export function computeReadiness(
  bars: OhlcBar[],
  futoi: SeriesPoint[],
  tokenOk: boolean,
  lastFutoiOkAt: string | null,
): Readiness {
  const lastBar = [...bars].reverse().find((b) => b.complete);
  const lastOi = futoi.at(-1);
  const priceAge = ageMinFromIso(lastBar?.end);
  const lifetimeSec = lastFutoiOkAt
    ? Math.max(0, Math.round((Date.now() - Date.parse(lastFutoiOkAt)) / 1000))
    : lastOi
      ? Math.max(0, Math.round((Date.now() - Date.parse(tsOf(lastOi))) / 1000))
      : null;
  const lifetimeMin = lifetimeSec != null ? lifetimeSec / 60 : null;
  const price = lamp(priceAge, 7, 20, 'red');
  const oi = !tokenOk ? 'red' : lamp(lifetimeMin, 12, 25, 'red');
  return {
    timeframe: 'M5',
    price_ready: price,
    oi_ready: oi,
    execution_ready: 'gray',
    price_detail: lastBar
      ? `последний закрытый M5 ${lastBar.end}${priceAge != null ? ` (${priceAge.toFixed(1)} мин назад)` : ''}`
      : 'нет Super Candles Algopack',
    oi_detail: !tokenOk
      ? 'нет ALGOPACK_TOKEN — без снимка B1 = oi_unavailable'
      : lastOi
        ? `пакет ${lastOi.ts} · lifetime ${formatMmSs(lifetimeSec)}`
        : 'нет снимков FUTOI',
    execution_detail: 'PlaceOrder выключен, только виртуальные сделки',
    consequence:
      price === 'red'
        ? 'детекция не идёт, покрытие пишется как gap'
        : oi === 'red'
          ? 'B0 продолжает; B1 без снимка — oi_unavailable, со старым снимком — filter по ΔOI'
          : 'обе книги могут открывать виртуальные сделки',
  };
}
