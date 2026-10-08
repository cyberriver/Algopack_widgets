import { getSnapshot } from '@/lib/moex';
import { DEFAULT_SECID } from '@/lib/types';
import { withBearer } from '@/lib/with-bearer';

export async function GET(request: Request) {
  const secid = new URL(request.url).searchParams.get('secid')?.trim() || DEFAULT_SECID;
  return withBearer(() => getSnapshot(secid));
}
