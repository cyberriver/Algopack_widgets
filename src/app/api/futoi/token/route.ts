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
  if (probe === 'subscription_expired') {
    return NextResponse.json({ error: 'subscription_expired' }, { status: 403 });
  }
  await saveSessionToken(token);
  return NextResponse.json({ status: 'ok', probe });
}
