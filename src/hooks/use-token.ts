'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiPath } from '@/lib/api-base';
import { STATIC } from '@/lib/static-mode';
import { clearLocalToken, readLocalToken, writeLocalToken } from '@/lib/token-local';
import type { TokenStatus } from '@/lib/types';

function firstPaint(initial: TokenStatus): TokenStatus {
  if (typeof window !== 'undefined' && readLocalToken()) return 'ok';
  return initial === 'connecting' ? 'no_token' : initial;
}

async function readJson(res: Response): Promise<{ error?: TokenStatus; status?: TokenStatus }> {
  return (await res.json().catch(() => ({}))) as { error?: TokenStatus; status?: TokenStatus };
}

export function useTokenGate(initial: TokenStatus = 'no_token'): {
  status: TokenStatus;
  ready: boolean;
  connect: (token: string, remember?: boolean) => Promise<void>;
  disconnect: () => void;
} {
  const [status, setStatus] = useState<TokenStatus>(() => firstPaint(initial));

  useEffect(() => {
    if (STATIC) {
      setStatus(readLocalToken() ? 'ok' : 'no_token');
      return;
    }
    if (readLocalToken() || initial === 'ok') {
      setStatus('ok');
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 8_000);
    void fetch(apiPath('/api/futoi/status'), { signal: ac.signal })
      .then((r) => r.json())
      .then((json: { status?: TokenStatus }) => setStatus(json.status === 'ok' ? 'ok' : 'no_token'))
      .catch(() => setStatus((cur) => (cur === 'connecting' ? 'no_token' : cur)))
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [initial]);

  const connect = useCallback(async (token: string, remember = true) => {
    const value = token.trim();
    if (!value) {
      setStatus('no_token');
      return;
    }
    setStatus('connecting');
    if (!writeLocalToken(value, remember)) {
      setStatus('upstream_error');
      return;
    }
    if (STATIC) {
      setStatus('ok');
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 12_000);
    try {
      const res = await fetch(apiPath('/api/futoi/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
        signal: ac.signal,
      });
      const json = await readJson(res);
      if (json.error === 'subscription_expired' || res.status === 403) {
        setStatus('subscription_expired');
        return;
      }
      if (!res.ok || json.error) {
        setStatus(json.error === 'no_token' ? 'no_token' : 'upstream_error');
        return;
      }
      setStatus('ok');
    } catch {
      setStatus('upstream_error');
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  const disconnect = useCallback(() => {
    clearLocalToken();
    setStatus('no_token');
  }, []);

  return { status, ready: status === 'ok', connect, disconnect };
}
