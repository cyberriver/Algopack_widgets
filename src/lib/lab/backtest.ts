import type { OhlcBar } from '@/lib/moex';
import type { SeriesPoint } from '@/lib/types';
import { atrAt, detectSignal, lookbackRange } from './engine';
import { isAfterCutoff } from './time';
import type { BacktestMetrics, BacktestRun, InstrumentProfile, LabExperiment, Protocol } from './types';
import { tsOf } from './join';
import { performanceStats } from './performance';

type Outcome = {
  time: string;
  direction: 'long' | 'short';
  r: number | null;
  skipped: boolean;
  skipReason: string | null;
  entry: number | null;
  exit: number | null;
};

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] == null ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function totalOi(point: SeriesPoint): number {
  return point.fiz.posLong + point.yur.posLong;
}

function historicalOiPositive(points: SeriesPoint[], barStart: string, windowMin: number): boolean | null {
  const start = Date.parse(barStart);
  const eligible = points
    .map((point) => ({ point, time: Date.parse(tsOf(point)) }))
    .filter((item) => Number.isFinite(item.time) && item.time < start)
    .sort((a, b) => a.time - b.time);
  const current = eligible.at(-1);
  if (!current) return null;
  const boundary = current.time - windowMin * 60_000;
  const reference = [...eligible].reverse().find((item) => item.time <= boundary);
  if (!reference) return null;
  const now = totalOi(current.point);
  const before = totalOi(reference.point);
  return now > 0 && before > 0 ? Math.log(now / before) > 0 : null;
}

function simulate(bars: OhlcBar[], oi: SeriesPoint[], experiment: LabExperiment): Outcome[] {
  const outcomes: Outcome[] = [];
  let occupiedUntil = -1;
  for (let index = 0; index < bars.length; index++) {
    const signal = detectSignal(bars, index, experiment.protocol);
    if (!signal) continue;
    if (isAfterCutoff(bars[index].end, experiment.protocol.session_cutoff_hhmm)) {
      outcomes.push({ time: bars[index].end, direction: signal.direction, r: null, skipped: true, skipReason: 'session_close', entry: null, exit: null });
      continue;
    }
    if (
      experiment.entry_rule === 'price_breakout_oi_up' &&
      historicalOiPositive(oi, bars[index].begin, experiment.protocol.oi_window_min) !== true
    ) {
      outcomes.push({ time: bars[index].end, direction: signal.direction, r: null, skipped: true, skipReason: 'oi_filter_or_unavailable', entry: null, exit: null });
      continue;
    }
    const entryIndex = index + 1;
    if (entryIndex >= bars.length || entryIndex <= occupiedUntil) {
      outcomes.push({ time: bars[index].end, direction: signal.direction, r: null, skipped: true, skipReason: 'position_already_open', entry: null, exit: null });
      continue;
    }
    const entry = bars[entryIndex].open;
    const risk = signal.atr * experiment.protocol.stop_atr;
    if (!(risk > 0)) {
      outcomes.push({ time: bars[index].end, direction: signal.direction, r: null, skipped: true, skipReason: 'atr_unavailable', entry: null, exit: null });
      continue;
    }
    const stop = signal.direction === 'long' ? entry - risk : entry + risk;
    const target =
      signal.direction === 'long'
        ? entry + signal.atr * experiment.protocol.target_atr
        : entry - signal.atr * experiment.protocol.target_atr;
    let exit = bars[Math.min(bars.length - 1, entryIndex + experiment.protocol.max_hold_bars - 1)].close;
    let exitIndex = Math.min(bars.length - 1, entryIndex + experiment.protocol.max_hold_bars - 1);
    for (let cursor = entryIndex; cursor <= exitIndex; cursor++) {
      const bar = bars[cursor];
      const hitStop = signal.direction === 'long' ? bar.low <= stop : bar.high >= stop;
      const hitTarget = signal.direction === 'long' ? bar.high >= target : bar.low <= target;
      const inside = bar.close >= signal.range_d && bar.close <= signal.range_u;
      if (hitStop) {
        exit = stop;
        exitIndex = cursor;
        break;
      }
      if (hitTarget) {
        exit = target;
        exitIndex = cursor;
        break;
      }
      if (inside || isAfterCutoff(bar.end, experiment.protocol.session_close_hhmm)) {
        exit = bar.close;
        exitIndex = cursor;
        break;
      }
    }
    occupiedUntil = exitIndex;
    const pnl = signal.direction === 'long' ? exit - entry : entry - exit;
    outcomes.push({ time: bars[index].end, direction: signal.direction, r: round(pnl / risk), skipped: false, skipReason: null, entry, exit });
  }
  return outcomes;
}

function metrics(
  outcomes: Outcome[],
  startingCapitalRub: number,
  riskPerTradePercent: number,
): BacktestMetrics {
  const closed = outcomes.filter((item) => item.r != null);
  const stats = performanceStats(closed.map((item) => item.r ?? 0), startingCapitalRub, riskPerTradePercent);
  const wins = closed.filter((item) => (item.r ?? 0) > 0).length;
  return {
    events: outcomes.length,
    trades: outcomes.length,
    closed: closed.length,
    skipped: outcomes.filter((item) => item.skipped).length,
    wins,
    win_rate: closed.length ? round(wins / closed.length, 4) : null,
    avg_r: stats.edge_r,
    ...stats,
  };
}

export function runHistoricalReplay(
  bars: OhlcBar[],
  oi: SeriesPoint[],
  experiment: LabExperiment,
  from: string,
  to: string,
  calibrationPercent = 70,
  startingCapitalRub = 15_000,
  riskPerTradePercent = 1,
): BacktestRun {
  const outcomes = simulate(bars, oi, experiment);
  const boundedCalibration = Math.min(90, Math.max(50, calibrationPercent));
  const splitIndex = Math.max(1, Math.floor(bars.length * (boundedCalibration / 100)));
  const splitAt = bars[splitIndex]?.begin ?? `${to}T00:00:00.000Z`;
  let net = 0;
  let peak = 0;
  const equity = outcomes
    .filter((item) => item.r != null)
    .map((item) => {
      net += item.r ?? 0;
      peak = Math.max(peak, net);
      return { time: item.time, net_r: round(net), drawdown_r: round(peak - net) };
    });
  return {
    id: `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    mode: 'historical_replay',
    created_at: new Date().toISOString(),
    from,
    to,
    split_at: splitAt,
    calibration_percent: boundedCalibration,
    latency_model_id: 'source_time_no_delay',
    starting_capital_rub: startingCapitalRub,
    risk_per_trade_percent: riskPerTradePercent,
    bars: bars.length,
    calibration: metrics(outcomes.filter((item) => item.time < splitAt), startingCapitalRub, riskPerTradePercent),
    holdout: metrics(outcomes.filter((item) => item.time >= splitAt), startingCapitalRub, riskPerTradePercent),
    full: metrics(outcomes, startingCapitalRub, riskPerTradePercent),
    trades: outcomes.map((item) => ({
      signal_time: item.time,
      direction: item.direction,
      status: item.skipped ? 'skipped' : 'closed',
      skip_reason: item.skipReason,
      entry_price: item.entry,
      exit_price: item.exit,
      net_r: item.r,
    })),
    equity,
  };
}

function excursionSamples(bars: OhlcBar[], protocol: Protocol): Array<{ adverse: number; favorable: number; hold: number }> {
  const samples: Array<{ adverse: number; favorable: number; hold: number }> = [];
  for (let index = 0; index < bars.length - 1; index++) {
    const signal = detectSignal(bars, index, protocol);
    if (!signal || signal.atr <= 0) continue;
    const entryIndex = index + 1;
    const entry = bars[entryIndex].open;
    let adverse = 0;
    let favorable = 0;
    let hold = 0;
    for (let cursor = entryIndex; cursor < Math.min(bars.length, entryIndex + protocol.max_hold_bars); cursor++) {
      const bar = bars[cursor];
      adverse = Math.max(
        adverse,
        signal.direction === 'long' ? (entry - bar.low) / signal.atr : (bar.high - entry) / signal.atr,
      );
      favorable = Math.max(
        favorable,
        signal.direction === 'long' ? (bar.high - entry) / signal.atr : (entry - bar.low) / signal.atr,
      );
      hold += 1;
      if (bar.close >= signal.range_d && bar.close <= signal.range_u) break;
    }
    samples.push({ adverse, favorable, hold });
  }
  return samples;
}

export function buildInstrumentProfile(
  bars: OhlcBar[],
  oi: SeriesPoint[],
  contract: string,
  family: string,
  from: string,
  to: string,
): InstrumentProfile {
  const complete = bars.filter((bar) => bar.complete);
  const latest = complete.at(-1);
  const tradingDays = new Set(complete.map((bar) => bar.begin.slice(0, 10))).size;
  const atrPeriods = [14, 20, 28];
  const atr = atrPeriods.map((period) => {
    const points = latest ? atrAt(complete, complete.length, period) : 0;
    return { period, points: round(points, 2), percent: latest?.close ? round((points / latest.close) * 100, 3) : 0 };
  });
  const levels = [6, 12, 24].map((period) => {
    const widths: number[] = [];
    let breakouts = 0;
    const protocol = { ...profileProtocol(contract, family), lookback_bars: period };
    for (let index = period; index < complete.length; index++) {
      const range = lookbackRange(complete, index, period);
      widths.push(range.u - range.d);
      if (detectSignal(complete, index, protocol)) breakouts += 1;
    }
    return {
      bars: period,
      median_width: round(quantile(widths, 0.5) ?? 0, 2),
      breakouts,
      breakouts_per_day: tradingDays ? round(breakouts / tradingDays, 2) : 0,
    };
  });
  const baseline = profileProtocol(contract, family);
  const samples = excursionSamples(complete, baseline);
  const atr20 = atr.find((item) => item.period === 20)?.points ?? 0;
  const stop = [1, 1.5, 2].map((multiple) => ({
    atr: multiple,
    points: round(atr20 * multiple, 2),
    survival_rate: samples.length
      ? round(samples.filter((sample) => sample.adverse < multiple).length / samples.length, 4)
      : null,
  }));
  const target = [1, 2, 3].map((multiple) => ({
    atr: multiple,
    points: round(atr20 * multiple, 2),
    reach_rate: samples.length
      ? round(samples.filter((sample) => sample.favorable >= multiple).length / samples.length, 4)
      : null,
  }));
  const oiRows = oi
    .map((point) => ({ time: Date.parse(tsOf(point)), value: totalOi(point) }))
    .filter((item) => Number.isFinite(item.time) && item.value > 0)
    .sort((a, b) => a.time - b.time);
  const intervals = oiRows.slice(1).map((item, index) => (item.time - oiRows[index].time) / 60_000);
  const oiChange = [5, 15, 30, 60].map((minutes) => {
    const values: number[] = [];
    let referenceIndex = -1;
    for (let index = 0; index < oiRows.length; index++) {
      const boundary = oiRows[index].time - minutes * 60_000;
      while (referenceIndex + 1 < index && oiRows[referenceIndex + 1].time <= boundary) referenceIndex += 1;
      const reference = referenceIndex >= 0 ? oiRows[referenceIndex] : undefined;
      if (reference) values.push(Math.log(oiRows[index].value / reference.value));
    }
    return {
      minutes,
      p25: quantile(values, 0.25) == null ? null : round(quantile(values, 0.25)!, 5),
      median: quantile(values, 0.5) == null ? null : round(quantile(values, 0.5)!, 5),
      p75: quantile(values, 0.75) == null ? null : round(quantile(values, 0.75)!, 5),
    };
  });
  const warnings: string[] = [];
  if (complete.length < 300) warnings.push('Меньше 300 закрытых M5-баров: подсказки нестабильны.');
  if (samples.length < 30) warnings.push('Меньше 30 пробоев: статистика стопов и целей только ориентир.');
  if (oiRows.length < 30) warnings.push('Недостаточно исторических снимков OI для устойчивых границ.');
  return {
    contract,
    family,
    from,
    to,
    bars: complete.length,
    trading_days: tradingDays,
    latest_price: latest?.close ?? null,
    atr,
    levels,
    stop,
    target,
    holding: {
      median_bars: quantile(samples.map((sample) => sample.hold), 0.5),
      p75_bars: quantile(samples.map((sample) => sample.hold), 0.75),
    },
    oi: {
      snapshots: oiRows.length,
      median_interval_min: quantile(intervals, 0.5),
      change: oiChange,
    },
    warnings,
  };
}

function profileProtocol(contract: string, family: string): Protocol {
  return {
    id: 'profile',
    contract,
    family,
    primary_timeframe: 'M5',
    live_variant: 'unset',
    tick_size: 1,
    lookback_bars: 12,
    atr_bars: 20,
    stop_atr: 1,
    target_atr: 2,
    max_hold_bars: 12,
    oi_window_min: 15,
    max_snapshot_age_min: 10,
    decision_deadline_ms: 120_000,
    max_signal_processing_ms: 30_000,
    session_close_hhmm: '18:50',
    session_cutoff_hhmm: '18:45',
  };
}
