import { getSeries, loadOhlcCandles, lookbackRange } from '@/lib/moex';
import { envToken } from '@/lib/token-store';
import { applyTick, summarize } from './engine';
import { tsOf } from './join';
import { buildMarket } from './market';
import { receiptsFor, recordFutoiReceipts, recordPriceReceipts } from './receipts';
import { computeReadiness } from './readiness';
import { withLabState } from './store';
import type { LabMarket, LabState, Readiness } from './types';

export type TickResult = {
  state: LabState;
  readiness: Readiness;
  summary: ReturnType<typeof summarize>;
  market: LabMarket | null;
  recent_bars: Awaited<ReturnType<typeof loadOhlcCandles>>;
  fetched: { bars: number; futoi: number };
  applied: { newEvents: number; newTrades: number };
};

export async function runLabTick(): Promise<TickResult> {
  return withLabState(async (state) => {
    const { from, to } = lookbackRange('5d');
    const tokenOk = Boolean(envToken());
    type Stream = {
      bars: Awaited<ReturnType<typeof loadOhlcCandles>>;
      futoi: Awaited<ReturnType<typeof getSeries>>['points'];
      errors: string[];
    };
    const streams = new Map<string, Stream>();
    const errors: string[] = [];
    const running = state.experiments.filter((experiment) => experiment.status === 'running');
    const selected =
      state.experiments.find((experiment) => experiment.id === state.selected_experiment_id) ?? state.experiments[0];
    const observed = selected && !running.some((experiment) => experiment.id === selected.id)
      ? [...running, selected]
      : running;
    for (const experiment of observed) {
      const { contract, family } = experiment.protocol;
      const key = `${contract}|${family}`;
      if (streams.has(key)) continue;
      const stream: Stream = { bars: [], futoi: [], errors: [] };
      try {
        stream.bars = await loadOhlcCandles(contract, from, to, 5, (priceBars) => {
          recordPriceReceipts(state, contract, priceBars, new Date().toISOString());
        });
      } catch (e) {
        stream.errors.push(`bars: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        const series = await getSeries(family, from, to, { quick: true, skipPrices: true });
        stream.futoi = series.points;
        const receivedAt = new Date().toISOString();
        recordFutoiReceipts(state, family, stream.futoi, receivedAt);
        state.last_futoi_ok_at = receivedAt;
        const last = stream.futoi.at(-1);
        if (last) state.last_futoi_asof = tsOf(last);
      } catch (e) {
        stream.errors.push(`futoi: ${e instanceof Error ? e.message : String(e)}`);
      }
      streams.set(key, stream);
      errors.push(...stream.errors.map((error) => `${contract}: ${error}`));
    }
    const nowIso = new Date().toISOString();
    const lifetime =
      state.last_futoi_ok_at != null
        ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(state.last_futoi_ok_at)) / 1000))
        : null;
    let newEvents = 0;
    let newTrades = 0;
    for (const experiment of running) {
      const { contract, family } = experiment.protocol;
      const stream = streams.get(`${contract}|${family}`) ?? { bars: [], futoi: [], errors: ['stream unavailable'] };
      const result = applyTick(
        experiment,
        stream.bars,
        stream.futoi,
        receiptsFor(state.price_receipts, contract),
        receiptsFor(state.futoi_receipts, family),
        nowIso,
        lifetime,
      );
      experiment.last_tick_at = nowIso;
      experiment.last_error = stream.errors.length ? stream.errors.join('; ') : null;
      newEvents += result.newEvents;
      newTrades += result.newTrades;
    }
    state.last_tick_at = nowIso;
    state.last_error = errors.length ? errors.join('; ') : null;
    state.protocol = selected.protocol;
    state.session = selected.session;
    state.events = selected.events;
    state.trades = selected.trades;
    state.annotations = selected.annotations;
    state.processed_bar_ends = selected.processed_bar_ends;
    const selectedStream = streams.get(`${selected.protocol.contract}|${selected.protocol.family}`) ?? {
      bars: [],
      futoi: [],
      errors: [],
    };
    return {
      state,
      readiness: computeReadiness(selectedStream.bars, selectedStream.futoi, tokenOk, state.last_futoi_ok_at),
      summary: summarize(selected),
      market: buildMarket(selectedStream.bars, selected.protocol, state.last_futoi_asof),
      recent_bars: selectedStream.bars.slice(-120),
      fetched: { bars: selectedStream.bars.length, futoi: selectedStream.futoi.length },
      applied: { newEvents, newTrades },
    };
  });
}
