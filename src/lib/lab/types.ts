export const LAB_PROTOCOL_ID = 'Si_breakout_v0.3';
export const LAB_ENGINE_VERSION = '1.0.0';
export const TICK_SIZE = 1;

export type Timeframe = 'M5' | 'M10' | 'M15' | 'M30' | 'H1' | 'D';
export type VariantId = 'B_PRICE' | 'B_OI_POSITIVE';
export type OiStatus = 'available' | 'received_late' | 'unavailable';
export type HypothesisId = 'H-MOVE' | 'H-OI' | 'H-BRK' | 'H-CONF';
export type HypothesisStatus = 'open' | 'watching' | 'abandoned';
export type QualityReview = 'not_reviewed' | 'valid' | 'data_issue' | 'protocol_issue';
export type Lamp = 'green' | 'yellow' | 'red' | 'gray';
export type SkipReason =
  | 'filter'
  | 'oi_unavailable'
  | 'session_close'
  | 'position_already_open'
  | 'price_received_late'
  | 'oi_received_late'
  | 'processing_late'
  | 'received_late'
  | 'risk_cap'
  | 'pending_entry';
export type TradeStatus = 'pending_entry' | 'open' | 'closed' | 'skipped';
export type HorizonStatus = 'complete' | 'truncated' | 'unavailable';

export type Protocol = {
  id: string;
  contract: string;
  family: string;
  primary_timeframe: Timeframe;
  live_variant: 'unset' | VariantId;
  tick_size: number;
  lookback_bars: number;
  atr_bars: number;
  stop_atr: number;
  target_atr: number;
  max_hold_bars: number;
  oi_window_min: number;
  max_snapshot_age_min: number;
  decision_deadline_ms: number;
  max_signal_processing_ms: number;
  session_close_hhmm: string;
  session_cutoff_hhmm: string;
};

export type Session = {
  id: string;
  protocol_id: string;
  mode: 'live_observation';
  started_at: string;
  contract: string;
};

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';
export type EntryRule = 'price_breakout' | 'price_breakout_oi_up';
export type ExecutionMode = 'virtual' | 'real';
export type QuantityMode = 'fixed_lots' | 'max_by_capital';

export type PerformanceStats = {
  edge_r: number | null;
  sharpe: number | null;
  sortino: number | null;
  net_r: number;
  max_drawdown_r: number;
  return_pct: number | null;
  profit_rub: number | null;
};

export type BacktestMetrics = {
  events: number;
  trades: number;
  closed: number;
  skipped: number;
  wins: number;
  win_rate: number | null;
  net_r: number;
  avg_r: number | null;
  max_drawdown_r: number;
  edge_r: number | null;
  sharpe: number | null;
  sortino: number | null;
  return_pct: number | null;
  profit_rub: number | null;
};

export type BacktestRun = {
  id: string;
  mode: 'historical_replay';
  created_at: string;
  from: string;
  to: string;
  split_at: string;
  calibration_percent: number;
  latency_model_id: 'source_time_no_delay';
  starting_capital_rub: number;
  risk_per_trade_percent: number;
  bars: number;
  calibration: BacktestMetrics;
  holdout: BacktestMetrics;
  full: BacktestMetrics;
  trades: Array<{
    signal_time: string;
    direction: 'long' | 'short';
    status: 'closed' | 'skipped';
    skip_reason: string | null;
    entry_price: number | null;
    exit_price: number | null;
    net_r: number | null;
  }>;
  equity: Array<{ time: string; net_r: number; drawdown_r: number }>;
};

export type ExperimentCompletionReport = PerformanceStats & {
  generated_at: string;
  started_at: string | null;
  completed_at: string;
  events: number;
  trades: number;
  closed: number;
  skipped: number;
  wins: number;
  win_rate: number | null;
  skip_reasons: Record<string, number>;
};

export type LabExperiment = {
  id: string;
  name: string;
  status: ExperimentStatus;
  entry_rule: EntryRule;
  execution_mode: ExecutionMode;
  capital_limit_rub: number | null;
  quantity_mode: QuantityMode;
  fixed_lots: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  protocol: Protocol;
  session: Session;
  events: LabEvent[];
  trades: LabTrade[];
  annotations: Record<string, Annotation>;
  processed_bar_ends: string[];
  backtests: BacktestRun[];
  completion_report: ExperimentCompletionReport | null;
  last_tick_at: string | null;
  last_error: string | null;
};

export type LabEvent = {
  event_id: string;
  timeframe: Timeframe;
  kind: 'B';
  protocol_id: string;
  session_id: string;
  source: 'detector';
  contract: string;
  family: string;
  direction: 'long' | 'short';
  signal_time: string;
  decision_time: string;
  bar_end: string;
  bar_begin: string;
  level: number;
  close: number;
  atr: number;
  buffer: number;
  range_u: number;
  range_d: number;
  move?: number | null;
  volume?: number | null;
  vol_b?: number | null;
  vol_s?: number | null;
  put_vol_b?: number | null;
  put_vol_s?: number | null;
  book_bid_vwap?: number | null;
  book_ask_vwap?: number | null;
  price_source: 'algopack_tradestats';
  price_received_at: string;
  decision_deadline: string;
  barrier_ready_at: string;
  oi: number | null;
  oi_ref: number | null;
  oi_change: number | null;
  oi_change_ln: number | null;
  oi_fresh: boolean | null;
  oi_status: OiStatus;
  futoi_lifetime_sec: number | null;
  fiz_long: number | null;
  fiz_short: number | null;
  yur_long: number | null;
  yur_short: number | null;
  snapshot_time: string | null;
  received_time: string | null;
  snapshot_age_sec: number | null;
  filter_passed: boolean | null;
  processing_delay_ms: number;
  decision_lateness: 'on_time' | 'processing_late';
  market_episode_id: string;
};

export type LabTrade = {
  trade_id: string;
  event_id: string;
  timeframe: Timeframe;
  variant_id: VariantId;
  mode: 'virtual';
  status: TradeStatus;
  skip_reason?: SkipReason;
  direction: 'long' | 'short';
  qty: 1;
  entry_time: string | null;
  entry_price: number | null;
  stop: number | null;
  target: number | null;
  exit_time: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  net_r: number | null;
};

export type Annotation = {
  event_id: string;
  quality_review: QualityReview;
  research_note: string;
  hypothesis_ids: HypothesisId[];
  updated_at: string;
};

export type HypothesisRow = {
  id: HypothesisId;
  claim: string;
  status: HypothesisStatus;
  updated_at: string;
};

export type CoverageGap = {
  id: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  reason: string;
};

export type Readiness = {
  timeframe: Timeframe;
  price_ready: Lamp;
  oi_ready: Lamp;
  execution_ready: Lamp;
  price_detail: string;
  oi_detail: string;
  execution_detail: string;
  consequence: string;
};

export type LabState = {
  protocol: Protocol;
  session: Session;
  events: LabEvent[];
  trades: LabTrade[];
  annotations: Record<string, Annotation>;
  hypotheses: Record<HypothesisId, HypothesisRow>;
  coverage_gaps: CoverageGap[];
  price_receipts: Record<string, DataReceipt>;
  futoi_receipts: Record<string, DataReceipt>;
  processed_bar_ends: string[];
  last_tick_at: string | null;
  last_futoi_ok_at: string | null;
  last_futoi_asof: string | null;
  last_error: string | null;
  experiments: LabExperiment[];
  selected_experiment_id: string;
};

export type DataReceipt = {
  source_time: string;
  received_at: string;
};

export type InstrumentProfile = {
  contract: string;
  family: string;
  from: string;
  to: string;
  bars: number;
  trading_days: number;
  latest_price: number | null;
  atr: Array<{ period: number; points: number; percent: number }>;
  levels: Array<{ bars: number; median_width: number; breakouts: number; breakouts_per_day: number }>;
  stop: Array<{ atr: number; points: number; survival_rate: number | null }>;
  target: Array<{ atr: number; points: number; reach_rate: number | null }>;
  holding: { median_bars: number | null; p75_bars: number | null };
  oi: {
    snapshots: number;
    median_interval_min: number | null;
    change: Array<{ minutes: number; p25: number | null; median: number | null; p75: number | null }>;
  };
  warnings: string[];
};

export type LabMarket = {
  contract: string;
  bar_begin: string;
  bar_end: string;
  complete: boolean;
  close: number;
  open: number;
  high: number;
  low: number;
  move: number;
  move_prev: number | null;
  pr_change: number | null;
  range_u: number | null;
  range_d: number | null;
  resistance: number | null;
  support: number | null;
  buffer: number | null;
  atr: number | null;
  volume: number;
  vol_b: number;
  vol_s: number;
  put_vol_b: number | null;
  put_vol_s: number | null;
  book_bid_vwap: number | null;
  book_ask_vwap: number | null;
  last_futoi_asof: string | null;
};

export function defaultProtocol(): Protocol {
  return {
    id: LAB_PROTOCOL_ID,
    contract: 'SiZ6',
    family: 'Si',
    primary_timeframe: 'M5',
    live_variant: 'unset',
    tick_size: TICK_SIZE,
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
