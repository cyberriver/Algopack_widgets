import { NextResponse } from 'next/server';
import { MoexError } from './errors';
import { jsonError } from './errors';
import { hasBearer, resolveBearer } from './token-store';
import { setRequestBearer } from './moex';

export async function withBearer<T>(fn: () => Promise<T>): Promise<NextResponse> {
  if (!(await hasBearer())) {
    return NextResponse.json(jsonError('no_token'), { status: 401 });
  }
  setRequestBearer(await resolveBearer());
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof MoexError) {
      const status = err.kind === 'subscription_expired' ? 403 : err.kind === 'no_token' ? 401 : 502;
      return NextResponse.json(jsonError(err.kind), { status });
    }
    return NextResponse.json(jsonError('upstream_error'), { status: 502 });
  }
}
