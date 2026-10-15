import { NextResponse } from 'next/server';
import { upsertAnnotation } from '@/lib/lab/store';
import type { HypothesisId, QualityReview } from '@/lib/lab/types';

export const dynamic = 'force-dynamic';

const REVIEWS = new Set<QualityReview>(['not_reviewed', 'valid', 'data_issue', 'protocol_issue']);
const HYPS = new Set<HypothesisId>(['H-MOVE', 'H-OI', 'H-BRK', 'H-CONF']);

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    event_id?: string;
    quality_review?: QualityReview;
    research_note?: string;
    hypothesis_ids?: HypothesisId[];
  };
  if (!body.event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 });
  }
  if (body.quality_review && !REVIEWS.has(body.quality_review)) {
    return NextResponse.json({ error: 'bad quality_review' }, { status: 400 });
  }
  if (body.hypothesis_ids?.some((id) => !HYPS.has(id))) {
    return NextResponse.json({ error: 'bad hypothesis_ids' }, { status: 400 });
  }
  const annotation = await upsertAnnotation(body.event_id, {
    quality_review: body.quality_review,
    research_note: body.research_note,
    hypothesis_ids: body.hypothesis_ids,
  });
  return NextResponse.json({ annotation });
}
