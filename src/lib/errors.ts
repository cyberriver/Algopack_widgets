export type TokenStatus = 'no_token' | 'connecting' | 'ok' | 'subscription_expired' | 'upstream_error';

export class MoexError extends Error {
  readonly kind: Exclude<TokenStatus, 'connecting' | 'ok'>;

  constructor(kind: Exclude<TokenStatus, 'connecting' | 'ok'>, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function statusFromHttp(code: number): Exclude<TokenStatus, 'connecting' | 'ok'> {
  if (code === 401 || code === 403) return 'subscription_expired';
  return 'upstream_error';
}

export function jsonError(kind: TokenStatus, extra: Record<string, unknown> = {}) {
  return { error: kind, ...extra };
}
