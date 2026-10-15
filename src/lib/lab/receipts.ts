import type { OhlcBar } from '@/lib/moex';
import type { SeriesPoint } from '@/lib/types';
import { tsOf } from './join';
import type { DataReceipt, LabState } from './types';

const MAX_RECEIPTS_PER_STREAM = 2500;

function trim(receipts: Record<string, DataReceipt>): Record<string, DataReceipt> {
  const streams = new Map<string, Array<[string, DataReceipt]>>();
  for (const entry of Object.entries(receipts)) {
    const separator = entry[0].indexOf(':');
    const stream = separator >= 0 ? entry[0].slice(0, separator) : '';
    const rows = streams.get(stream) ?? [];
    rows.push(entry);
    streams.set(stream, rows);
  }
  return Object.fromEntries(
    [...streams.values()].flatMap((entries) =>
      entries
        .sort(([, a], [, b]) => a.source_time.localeCompare(b.source_time))
        .slice(-MAX_RECEIPTS_PER_STREAM),
    ),
  );
}

export function recordPriceReceipts(state: LabState, contract: string, bars: OhlcBar[], receivedAt: string): void {
  for (const bar of bars) {
    const key = `${contract}:${bar.end}`;
    if (!bar.complete || state.price_receipts[key]) continue;
    state.price_receipts[key] = { source_time: bar.end, received_at: receivedAt };
  }
  state.price_receipts = trim(state.price_receipts);
}

export function recordFutoiReceipts(state: LabState, family: string, points: SeriesPoint[], receivedAt: string): void {
  for (const point of points) {
    const sourceTime = tsOf(point);
    const key = `${family}:${sourceTime}`;
    if (state.futoi_receipts[key]) continue;
    state.futoi_receipts[key] = { source_time: sourceTime, received_at: receivedAt };
  }
  state.futoi_receipts = trim(state.futoi_receipts);
}

export function receiptsFor(receipts: Record<string, DataReceipt>, stream: string): Record<string, DataReceipt> {
  const prefix = `${stream}:`;
  return Object.fromEntries(
    Object.entries(receipts)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, receipt]) => [key.slice(prefix.length), receipt]),
  );
}
