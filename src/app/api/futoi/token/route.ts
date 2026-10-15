import { NextResponse } from 'next/server';
import { clearUpstreamDown, probeToken, setRequestBearer } from '@/lib/moex';
import { saveSessionToken } from '@/lib/token-store';

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: 'no_token' }, { status: 400 });
  }
  const token = body.token?.trim() ?? '';
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 400 });

  setRequestBearer(token);
  clearUpstreamDown();
  const probe = await probeToken(token);
  if (probe !== 'ok') {
    const status = probe === 'subscription_expired' ? 403 : 502;
    return NextResponse.json({ error: probe }, { status });
  }
  await saveSessionToken(token);
  return NextResponse.json({ status: 'ok', probe });
}
