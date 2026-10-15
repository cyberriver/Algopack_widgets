import type { ExperimentCompletionReport, LabExperiment, PerformanceStats } from './types';

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

export function performanceStats(
  returnsR: number[],
  startingCapitalRub?: number | null,
  riskPerTradePercent?: number | null,
): PerformanceStats {
  if (!returnsR.length) {
    return {
      edge_r: null,
      sharpe: null,
      sortino: null,
      net_r: 0,
      max_drawdown_r: 0,
      return_pct: startingCapitalRub && riskPerTradePercent ? 0 : null,
      profit_rub: startingCapitalRub && riskPerTradePercent ? 0 : null,
    };
  }

  const net = returnsR.reduce((sum, value) => sum + value, 0);
  const mean = net / returnsR.length;
  const variance =
    returnsR.length > 1
      ? returnsR.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returnsR.length - 1)
      : 0;
  const standardDeviation = Math.sqrt(variance);
  const downsideDeviation = Math.sqrt(
    returnsR.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / returnsR.length,
  );
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of returnsR) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const hasMoneyModel =
    startingCapitalRub != null &&
    startingCapitalRub > 0 &&
    riskPerTradePercent != null &&
    riskPerTradePercent > 0;
  const profitRub = hasMoneyModel ? net * startingCapitalRub * (riskPerTradePercent / 100) : null;

  return {
    edge_r: round(mean),
    sharpe: standardDeviation > 0 ? round((mean / standardDeviation) * Math.sqrt(returnsR.length)) : null,
    sortino: downsideDeviation > 0 ? round((mean / downsideDeviation) * Math.sqrt(returnsR.length)) : null,
    net_r: round(net),
    max_drawdown_r: round(maxDrawdown),
    return_pct: hasMoneyModel ? round(net * riskPerTradePercent) : null,
    profit_rub: profitRub == null ? null : round(profitRub, 2),
  };
}

export function buildCompletionReport(
  experiment: LabExperiment,
  completedAt: string,
): ExperimentCompletionReport {
  const closedReturns = experiment.trades
    .filter((trade) => trade.status === 'closed' && trade.net_r != null)
    .map((trade) => trade.net_r as number);
  const wins = closedReturns.filter((value) => value > 0).length;
  const skipReasons: Record<string, number> = {};
  for (const trade of experiment.trades) {
    if (trade.status !== 'skipped') continue;
    const reason = trade.skip_reason ?? 'unknown';
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  }
  return {
    generated_at: completedAt,
    started_at: experiment.started_at,
    completed_at: completedAt,
    events: experiment.events.length,
    trades: experiment.trades.length,
    closed: closedReturns.length,
    skipped: experiment.trades.filter((trade) => trade.status === 'skipped').length,
    wins,
    win_rate: closedReturns.length ? Number((wins / closedReturns.length).toFixed(4)) : null,
    skip_reasons: skipReasons,
    ...performanceStats(closedReturns),
  };
}
