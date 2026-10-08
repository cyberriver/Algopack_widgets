import { NextResponse } from 'next/server';
import { MoexError, jsonError } from './errors';
import { envToken, sessionToken } from './token-store';
import { setRequestBearer } from './moex';

function bearerFromRequest(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

export async function withBearer<T>(request: Request, fn: () => Promise<T>): Promise<NextResponse> {
  const bearer = bearerFromRequest(request) || (await sessionToken()) || envToken();
  if (!bearer) {
    return NextResponse.json(jsonError('no_token'), { status: 401 });
  }
  setRequestBearer(bearer);
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof MoexError) {
      const status = err.kind === 'subscription_expired' ? 403 : err.kind === 'no_token' ? 401 : 502;
      return NextResponse.json(jsonError(err.kind, { message: err.message }), { status });
    }
    return NextResponse.json(jsonError('upstream_error'), { status: 502 });
  }
}
