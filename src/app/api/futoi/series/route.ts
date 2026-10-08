import { getSeries, lookbackRange } from '@/lib/moex';
import { DEFAULT_SECID, type Lookback } from '@/lib/types';
import { withBearer } from '@/lib/with-bearer';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const secid = q.get('secid')?.trim() || DEFAULT_SECID;
  const lookback = (q.get('lookback') as Lookback | null) ?? 'session';
  const range = lookbackRange(lookback, q.get('sessionDate') ?? undefined);
  return withBearer(async () => {
    const series = await getSeries(secid, q.get('from') ?? range.from, q.get('to') ?? range.to);
    return { secid, ...series };
  });
}
