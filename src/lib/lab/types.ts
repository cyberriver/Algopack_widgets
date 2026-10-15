export const LAB_PROTOCOL_ID = 'Si_breakout_v0.2';
export const LAB_ENGINE_VERSION = '0.7.0';
export const TICK_SIZE = 1;

export type Timeframe = 'M5' | 'M10' | 'M15' | 'M30' | 'H1' | 'D';
export type VariantId = 'B_PRICE' | 'B_OI_POSITIVE';
export type OiStatus = 'available' | 'unavailable';
export type HypothesisId = 'H-MOVE' | 'H-OI' | 'H-BRK' | 'H-CONF';
export type HypothesisStatus = 'open' | 'watching' | 'abandoned';
export type QualityReview = 'not_reviewed' | 'valid' | 'data_issue' | 'protocol_issue';
export type Lamp = 'green' | 'yellow' | 'red' | 'gray';
export type SkipReason =
  | 'filter'
  | 'oi_unavailable'
  | 'session_close'
  | 'position_already_open'
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
  price_source: 'algopack_tradestats';
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
  processed_bar_ends: string[];
  last_tick_at: string | null;
  last_futoi_ok_at: string | null;
  last_error: string | null;
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
    max_signal_processing_ms: 120_000,
    session_close_hhmm: '18:50',
    session_cutoff_hhmm: '18:45',
  };
}
