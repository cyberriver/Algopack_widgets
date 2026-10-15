import type { OhlcBar } from '@/lib/moex';
import { joinOi, oiPositive, type OiSnap } from './join';
import { isAfterCutoff } from './time';
import type { LabEvent, LabState, LabTrade, Protocol, VariantId } from './types';
import { TICK_SIZE } from './types';
import type { SeriesPoint } from '@/lib/types';

export type Signal = {
  index: number;
  direction: 'long' | 'short';
  level: number;
  atr: number;
  buffer: number;
  range_u: number;
  range_d: number;
};

export function trueRange(prevClose: number, bar: OhlcBar): number {
  return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
}

export function atrAt(bars: OhlcBar[], index: number, period: number): number {
  if (index < 1) return 0;
  const start = Math.max(1, index - period);
  const ranges: number[] = [];
  for (let i = start; i < index; i++) {
    ranges.push(trueRange(bars[i - 1].close, bars[i]));
  }
  if (!ranges.length) return 0;
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

export function lookbackRange(bars: OhlcBar[], index: number, lookback: number): { u: number; d: number } {
  const slice = bars.slice(Math.max(0, index - lookback), index);
  return {
    u: Math.max(...slice.map((b) => b.high)),
    d: Math.min(...slice.map((b) => b.low)),
  };
}

export function detectSignal(bars: OhlcBar[], index: number, protocol: Protocol): Signal | null {
  if (index < protocol.lookback_bars || index < 1) return null;
  const bar = bars[index];
  if (!bar.complete) return null;
  const prev = bars[index - 1];
  const atr = atrAt(bars, index, protocol.atr_bars);
  const buffer = Math.max(2 * protocol.tick_size, 0.1 * atr);
  const { u, d } = lookbackRange(bars, index, protocol.lookback_bars);
  const longLevel = u + buffer;
  const shortLevel = d - buffer;
  if (prev.close <= longLevel && bar.close > longLevel) {
    return { index, direction: 'long', level: longLevel, atr, buffer, range_u: u, range_d: d };
  }
  if (prev.close >= shortLevel && bar.close < shortLevel) {
    return { index, direction: 'short', level: shortLevel, atr, buffer, range_u: u, range_d: d };
  }
  return null;
}

function rMultiple(direction: 'long' | 'short', entry: number, exit: number, stop: number): number {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  const pnl = direction === 'long' ? exit - entry : entry - exit;
  return pnl / risk;
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function hasOpenTrade(state: LabState, variant: VariantId): boolean {
  return state.trades.some((t) => t.variant_id === variant && (t.status === 'open' || t.status === 'pending_entry'));
}

function makeEvent(
  state: LabState,
  bar: OhlcBar,
  signal: Signal,
  nowIso: string,
  oi: OiSnap | { status: 'unavailable' },
  futoiLifetimeSec: number | null,
): LabEvent {
  const processing = Date.parse(nowIso) - Date.parse(bar.end);
  return {
    event_id: nextId('evt'),
    timeframe: 'M5',
    kind: 'B',
    protocol_id: state.protocol.id,
    session_id: state.session.id,
    source: 'detector',
    contract: state.protocol.contract,
    family: state.protocol.family,
    direction: signal.direction,
    signal_time: bar.end,
    decision_time: bar.end,
    bar_end: bar.end,
    bar_begin: bar.begin,
    level: signal.level,
    close: bar.close,
    atr: signal.atr,
    buffer: signal.buffer,
    range_u: signal.range_u,
    range_d: signal.range_d,
    price_source: 'algopack_tradestats',
    oi: oi.status === 'available' ? oi.oi : null,
    oi_ref: oi.status === 'available' ? oi.oi_ref : null,
    oi_change: oi.status === 'available' ? oi.oi_change : null,
    oi_change_ln: oi.status === 'available' ? oi.oi_change_ln : null,
    oi_fresh: oi.status === 'available' ? oi.oi_fresh : null,
    oi_status: oi.status === 'available' ? 'available' : 'unavailable',
    futoi_lifetime_sec: futoiLifetimeSec,
    fiz_long: oi.status === 'available' ? oi.fiz_long : null,
    fiz_short: oi.status === 'available' ? oi.fiz_short : null,
    yur_long: oi.status === 'available' ? oi.yur_long : null,
    yur_short: oi.status === 'available' ? oi.yur_short : null,
    snapshot_time: oi.status === 'available' ? oi.snapshot_time : null,
    received_time: oi.status === 'available' ? oi.received_time : null,
    snapshot_age_sec: oi.status === 'available' ? oi.snapshot_age_sec : null,
    filter_passed: oiPositive(oi),
    processing_delay_ms: Math.max(0, processing),
    decision_lateness: processing > state.protocol.max_signal_processing_ms ? 'processing_late' : 'on_time',
    market_episode_id: `ep_${bar.end}`,
  };
}

function skipTrade(event: LabEvent, variant: VariantId, reason: LabTrade['skip_reason']): LabTrade {
  return {
    trade_id: nextId('tr'),
    event_id: event.event_id,
    timeframe: 'M5',
    variant_id: variant,
    mode: 'virtual',
    status: 'skipped',
    skip_reason: reason,
    direction: event.direction,
    qty: 1,
    entry_time: null,
    entry_price: null,
    stop: null,
    target: null,
    exit_time: null,
    exit_price: null,
    exit_reason: null,
    net_r: null,
  };
}

function pendingTrade(event: LabEvent, variant: VariantId): LabTrade {
  return {
    trade_id: nextId('tr'),
    event_id: event.event_id,
    timeframe: 'M5',
    variant_id: variant,
    mode: 'virtual',
    status: 'pending_entry',
    skip_reason: 'pending_entry',
    direction: event.direction,
    qty: 1,
    entry_time: null,
    entry_price: null,
    stop: null,
    target: null,
    exit_time: null,
    exit_price: null,
    exit_reason: null,
    net_r: null,
  };
}

function fillEntry(trade: LabTrade, event: LabEvent, protocol: Protocol, bar: OhlcBar): void {
  const entry = bar.open;
  const stop = event.direction === 'long' ? entry - protocol.stop_atr * event.atr : entry + protocol.stop_atr * event.atr;
  const target = event.direction === 'long' ? entry + protocol.target_atr * event.atr : entry - protocol.target_atr * event.atr;
  trade.status = 'open';
  trade.skip_reason = undefined;
  trade.entry_time = bar.begin;
  trade.entry_price = entry;
  trade.stop = Math.round(stop / TICK_SIZE) * TICK_SIZE;
  trade.target = Math.round(target / TICK_SIZE) * TICK_SIZE;
}

function tryExit(trade: LabTrade, event: LabEvent, protocol: Protocol, bars: OhlcBar[], fromIndex: number): void {
  if (trade.status !== 'open' || trade.entry_price == null || trade.stop == null || trade.target == null) return;
  const holdUntil = fromIndex + protocol.max_hold_bars;
  for (let i = fromIndex; i < bars.length && i < holdUntil; i++) {
    const bar = bars[i];
    if (!bar.complete) break;
    const hitStop = event.direction === 'long' ? bar.low <= trade.stop : bar.high >= trade.stop;
    const hitTarget = event.direction === 'long' ? bar.high >= trade.target : bar.low <= trade.target;
    const inside = bar.close >= event.range_d && bar.close <= event.range_u;
    let reason: string | null = null;
    let price = bar.close;
    if (hitStop && hitTarget) {
      reason = 'stop_target_same_bar';
      price = trade.stop;
    } else if (hitStop) {
      reason = 'stop';
      price = trade.stop;
    } else if (hitTarget) {
      reason = 'target';
      price = trade.target;
    } else if (inside) {
      reason = 'range_return';
      price = bar.close;
    } else if (i === holdUntil - 1) {
      reason = 'time';
      price = bar.close;
    } else if (isAfterCutoff(bar.end, protocol.session_close_hhmm)) {
      reason = 'session_close';
      price = bar.close;
    }
    if (!reason) continue;
    trade.status = 'closed';
    trade.exit_time = bar.end;
    trade.exit_price = price;
    trade.exit_reason = reason;
    trade.net_r = Number(rMultiple(event.direction, trade.entry_price, price, trade.stop).toFixed(3));
    return;
  }
}

export function applyTick(
  state: LabState,
  bars: OhlcBar[],
  futoi: SeriesPoint[],
  nowIso: string,
  futoiLifetimeSec: number | null = null,
): { newEvents: number; newTrades: number } {
  let newEvents = 0;
  let newTrades = 0;
  const seen = new Set(state.processed_bar_ends);
  const protocol = state.protocol;

  for (const trade of state.trades) {
    if (trade.status !== 'pending_entry' && trade.status !== 'open') continue;
    const event = state.events.find((e) => e.event_id === trade.event_id);
    if (!event) continue;
    const signalIdx = bars.findIndex((b) => b.end === event.bar_end);
    if (signalIdx < 0) continue;
    if (trade.status === 'pending_entry') {
      const next = bars[signalIdx + 1];
      if (!next) continue;
      if (isAfterCutoff(event.decision_time, protocol.session_cutoff_hhmm)) {
        trade.status = 'skipped';
        trade.skip_reason = 'session_close';
        continue;
      }
      fillEntry(trade, event, protocol, next);
    }
    const entryIdx = bars.findIndex((b) => b.begin === trade.entry_time);
    tryExit(trade, event, protocol, bars, entryIdx >= 0 ? entryIdx : signalIdx + 1);
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar.complete || seen.has(bar.end)) continue;
    seen.add(bar.end);
    state.processed_bar_ends.push(bar.end);
    const signal = detectSignal(bars, i, protocol);
    if (!signal) continue;

    const oi = joinOi(futoi, bar.begin, nowIso, protocol.oi_window_min, protocol.max_snapshot_age_min);
    const event = makeEvent(state, bar, signal, nowIso, oi, futoiLifetimeSec);
    state.events.push(event);
    newEvents += 1;

    const late = event.decision_lateness === 'processing_late';
    for (const variant of ['B_PRICE', 'B_OI_POSITIVE'] as VariantId[]) {
      if (isAfterCutoff(event.decision_time, protocol.session_cutoff_hhmm)) {
        state.trades.push(skipTrade(event, variant, 'session_close'));
        newTrades += 1;
        continue;
      }
      if (late) {
        state.trades.push(skipTrade(event, variant, 'processing_late'));
        newTrades += 1;
        continue;
      }
      if (variant === 'B_OI_POSITIVE' && event.oi_status === 'unavailable') {
        state.trades.push(skipTrade(event, variant, 'oi_unavailable'));
        newTrades += 1;
        continue;
      }
      if (variant === 'B_OI_POSITIVE' && event.filter_passed !== true) {
        state.trades.push(skipTrade(event, variant, 'filter'));
        newTrades += 1;
        continue;
      }
      if (hasOpenTrade(state, variant)) {
        state.trades.push(skipTrade(event, variant, 'position_already_open'));
        newTrades += 1;
        continue;
      }
      const trade = pendingTrade(event, variant);
      const next = bars[i + 1];
      if (next) fillEntry(trade, event, protocol, next);
      state.trades.push(trade);
      newTrades += 1;
      if (trade.status === 'open') {
        const entryIdx = bars.findIndex((b) => b.begin === trade.entry_time);
        tryExit(trade, event, protocol, bars, entryIdx >= 0 ? entryIdx : i + 1);
      }
    }
  }

  if (state.processed_bar_ends.length > 4000) {
    state.processed_bar_ends = state.processed_bar_ends.slice(-2000);
  }
  return { newEvents, newTrades };
}

export function summarize(state: LabState) {
  const rows = (['B_PRICE', 'B_OI_POSITIVE'] as VariantId[]).map((variant) => {
    const trades = state.trades.filter((t) => t.variant_id === variant);
    const closed = trades.filter((t) => t.status === 'closed' && t.net_r != null);
    const skipped = trades.filter((t) => t.status === 'skipped');
    const net = closed.reduce((s, t) => s + (t.net_r ?? 0), 0);
    return {
      variant,
      events: new Set(trades.map((t) => t.event_id)).size,
      trades: trades.filter((t) => t.status !== 'skipped').length,
      closed: closed.length,
      skipped: skipped.length,
      wins: closed.filter((t) => (t.net_r ?? 0) > 0).length,
      net_r: Number(net.toFixed(3)),
      avg_r: closed.length ? Number((net / closed.length).toFixed(3)) : null,
    };
  });
  return rows;
}
