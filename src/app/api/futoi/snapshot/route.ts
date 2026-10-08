import { getSnapshot } from '@/lib/moex';
import { DEFAULT_SECID } from '@/lib/types';
import { withBearer } from '@/lib/with-bearer';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const secid = q.get('secid')?.trim() || DEFAULT_SECID;
  return withBearer(request, () => getSnapshot(secid, { quick: q.get('quick') === '1' }));
}
