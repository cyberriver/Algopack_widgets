import type { OhlcBar } from '@/lib/moex';
import { atrAt, lookbackRange } from './engine';
import type { LabMarket, Protocol } from './types';

export function buildMarket(bars: OhlcBar[], protocol: Protocol, lastFutoiAsof: string | null): LabMarket | null {
  if (!bars.length) return null;
  const index = bars.length - 1;
  const bar = bars[index];
  const prev = bars[index - 1];
  const atr = index >= 1 ? atrAt(bars, index, protocol.atr_bars) : 0;
  const buffer = Math.max(2 * protocol.tick_size, 0.1 * atr);
  const haveRange = index >= protocol.lookback_bars;
  const { u, d } = haveRange ? lookbackRange(bars, index, protocol.lookback_bars) : { u: NaN, d: NaN };
  return {
    contract: protocol.contract,
    bar_begin: bar.begin,
    bar_end: bar.end,
    complete: bar.complete,
    close: bar.close,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    move: bar.close - bar.open,
    move_prev: prev ? bar.close - prev.close : null,
    pr_change: bar.pr_change ?? null,
    range_u: haveRange ? u : null,
    range_d: haveRange ? d : null,
    resistance: haveRange ? u + buffer : null,
    support: haveRange ? d - buffer : null,
    buffer: haveRange ? buffer : null,
    atr: haveRange ? atr : null,
    volume: bar.volume ?? 0,
    vol_b: bar.vol_b ?? 0,
    vol_s: bar.vol_s ?? 0,
    put_vol_b: bar.put_vol_b ?? null,
    put_vol_s: bar.put_vol_s ?? null,
    book_bid_vwap: bar.book_bid_vwap ?? null,
    book_ask_vwap: bar.book_ask_vwap ?? null,
    last_futoi_asof: lastFutoiAsof,
  };
}
