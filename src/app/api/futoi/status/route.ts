import { NextResponse } from 'next/server';
import { envToken, sessionToken } from '@/lib/token-store';

export async function GET() {
  if (await sessionToken()) return NextResponse.json({ status: 'ok', source: 'session' });
  if (envToken()) return NextResponse.json({ status: 'ok', source: 'env' });
  return NextResponse.json({ status: 'no_token' });
}
