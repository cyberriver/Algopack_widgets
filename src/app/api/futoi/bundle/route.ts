import { getSeries, getSnapshot, lookbackRange } from '@/lib/moex';
import { DEFAULT_SECID, type Lookback } from '@/lib/types';
import { withBearer } from '@/lib/with-bearer';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const secid = q.get('secid')?.trim() || DEFAULT_SECID;
  const lookback = (q.get('lookback') as Lookback | null) ?? 'session';
  const range = lookbackRange(lookback, q.get('sessionDate') ?? undefined);
  const from = q.get('from') ?? range.from;
  const to = q.get('to') ?? range.to;
  const quick = q.get('quick') === '1';
  return withBearer(request, async () => {
    const [snapshot, series] = await Promise.all([
      getSnapshot(secid, { quick }),
      getSeries(secid, from, to, { quick }),
    ]);
    return { snapshot, series: { secid, ...series } };
  });
}
