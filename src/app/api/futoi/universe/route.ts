import { NextResponse } from 'next/server';
import { getUniverse } from '@/lib/moex';

export async function GET() {
  try {
    return NextResponse.json({ items: await getUniverse() });
  } catch (err) {
    return NextResponse.json(
      { error: 'universe_failed', message: err instanceof Error ? err.message : 'error' },
      { status: 502 },
    );
  }
}
