import { NextResponse } from 'next/server';
import { DEFAULT_UNIVERSE } from '@/lib/types';
import { resetJournal, withLabState } from '@/lib/lab/store';
import { frontContract } from '@/lib/lab/time';

export const dynamic = 'force-dynamic';

function normalizeFamily(raw: string): string | null {
  const hit = DEFAULT_UNIVERSE.find((u) => u.toLowerCase() === raw.toLowerCase());
  return hit ?? null;
}

function parseTicker(raw: string): { family: string; contract: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/^([A-Za-z]+)([FGHJKMNQUVXZ])(\d{1,2})$/i);
  if (m) {
    const family = normalizeFamily(m[1]);
    if (!family) return null;
    return { family, contract: `${family}${m[2].toUpperCase()}${m[3]}` };
  }
  const family = normalizeFamily(t);
  if (!family) return null;
  return { family, contract: frontContract(family) };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { ticker?: string; family?: string; contract?: string; confirm?: boolean };
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'confirm required' }, { status: 400 });
  }
  const parsed = body.family
    ? (() => {
        const family = normalizeFamily(body.family);
        if (!family) return null;
        return { family, contract: body.contract || frontContract(family) };
      })()
    : body.ticker
      ? parseTicker(body.ticker)
      : null;
  if (!parsed) {
    return NextResponse.json({ error: 'ticker or family required', available: DEFAULT_UNIVERSE }, { status: 400 });
  }
  const state = await withLabState((s) => {
    resetJournal(s, parsed.family, parsed.contract);
    return s;
  });
  return NextResponse.json({
    protocol: state.protocol,
    session: state.session,
    reset: true,
  });
}
