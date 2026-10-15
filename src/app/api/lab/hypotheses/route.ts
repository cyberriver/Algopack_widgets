import { NextResponse } from 'next/server';
import { defaultHypotheses } from '@/lib/lab/hypotheses';
import { readLabState, upsertHypothesis } from '@/lib/lab/store';
import type { HypothesisId, HypothesisStatus } from '@/lib/lab/types';

export const dynamic = 'force-dynamic';

const IDS = new Set<HypothesisId>(['H-MOVE', 'H-OI', 'H-BRK', 'H-CONF']);
const STATUSES = new Set<HypothesisStatus>(['open', 'watching', 'abandoned']);

export async function GET() {
  return NextResponse.json({ hypotheses: readLabState().hypotheses ?? defaultHypotheses() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: HypothesisId; status?: HypothesisStatus };
  if (!body.id || !IDS.has(body.id) || !body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }
  const hypothesis = await upsertHypothesis(body.id, body.status);
  return NextResponse.json({ hypothesis });
}
