'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiPath } from '@/lib/api-base';
import { STATIC } from '@/lib/static-mode';
import { clearLocalToken, readLocalToken, writeLocalToken } from '@/lib/token-local';
import type { TokenStatus } from '@/lib/types';

export function useTokenGate(): {
  status: TokenStatus;
  ready: boolean;
  connect: (token: string, remember?: boolean) => Promise<void>;
  disconnect: () => void;
} {
  const [status, setStatus] = useState<TokenStatus>('connecting');

  useEffect(() => {
    if (readLocalToken()) {
      setStatus('ok');
      return;
    }
    if (STATIC) {
      setStatus('no_token');
      return;
    }
    void fetch(apiPath('/api/futoi/status'))
      .then((r) => r.json())
      .then((json: { status?: TokenStatus }) => setStatus(json.status === 'ok' ? 'ok' : 'no_token'))
      .catch(() => setStatus('no_token'));
  }, []);

  const connect = useCallback(async (token: string, remember = true) => {
    const value = token.trim();
    if (!value) {
      setStatus('no_token');
      return;
    }
    setStatus('connecting');
    const saved = writeLocalToken(value, remember);
    if (!saved) {
      setStatus('upstream_error');
      return;
    }

    if (STATIC) {
      setStatus('ok');
      return;
    }

    try {
      const res = await fetch(apiPath('/api/futoi/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      const json = (await res.json()) as { error?: TokenStatus; status?: TokenStatus };
      if (json.error === 'subscription_expired') {
        setStatus('subscription_expired');
        return;
      }
      if (json.error === 'no_token' && !res.ok) {
        setStatus('no_token');
        return;
      }
      if (json.error === 'upstream_error' && !res.ok) {
        setStatus('upstream_error');
        return;
      }
      setStatus('ok');
    } catch {
      setStatus('upstream_error');
    }
  }, []);

  const disconnect = useCallback(() => {
    clearLocalToken();
    setStatus('no_token');
  }, []);

  return { status, ready: status === 'ok', connect, disconnect };
}
