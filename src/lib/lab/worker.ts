import { getSeries, loadOhlcCandles, lookbackRange } from '@/lib/moex';
import { envToken } from '@/lib/token-store';
import { applyTick, summarize } from './engine';
import { computeReadiness } from './readiness';
import { withLabState } from './store';
import type { LabState, Readiness } from './types';

export type TickResult = {
  state: LabState;
  readiness: Readiness;
  summary: ReturnType<typeof summarize>;
  fetched: { bars: number; futoi: number };
  applied: { newEvents: number; newTrades: number };
};

export async function runLabTick(): Promise<TickResult> {
  return withLabState(async (state) => {
    const { from, to } = lookbackRange('5d');
    const tokenOk = Boolean(envToken());
    let bars = [] as Awaited<ReturnType<typeof loadOhlcCandles>>;
    let futoi: Awaited<ReturnType<typeof getSeries>>['points'] = [];
    const errors: string[] = [];
    try {
      bars = await loadOhlcCandles(state.protocol.contract, from, to, 5);
    } catch (e) {
      errors.push(`bars: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const series = await getSeries(state.protocol.family, from, to, { quick: true, skipPrices: true });
      futoi = series.points;
      state.last_futoi_ok_at = new Date().toISOString();
    } catch (e) {
      errors.push(`futoi: ${e instanceof Error ? e.message : String(e)}`);
    }
    const nowIso = new Date().toISOString();
    const lifetime =
      state.last_futoi_ok_at != null ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(state.last_futoi_ok_at)) / 1000)) : null;
    const applied = applyTick(state, bars, futoi, nowIso, lifetime);
    state.last_tick_at = new Date().toISOString();
    state.last_error = errors.length ? errors.join('; ') : null;
    return {
      state,
      readiness: computeReadiness(bars, futoi, tokenOk, state.last_futoi_ok_at),
      summary: summarize(state),
      fetched: { bars: bars.length, futoi: futoi.length },
      applied,
    };
  });
}
