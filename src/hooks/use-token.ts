'use client';

import { useCallback, useEffect, useState } from 'react';
import { probeBrowserToken } from '@/lib/moex-browser';
import { STATIC } from '@/lib/static-mode';
import { readLocalToken, writeLocalToken } from '@/lib/token-local';
import type { TokenStatus } from '@/lib/types';

export function useTokenGate(): {
  status: TokenStatus;
  open: boolean;
  setOpen: (open: boolean) => void;
  connect: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<TokenStatus>('connecting');
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (STATIC) {
      setStatus(readLocalToken() ? 'ok' : 'no_token');
      return;
    }
    const res = await fetch('/api/futoi/status');
    const json = (await res.json()) as { status?: TokenStatus };
    setStatus(json.status === 'ok' ? 'ok' : 'no_token');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async (token: string) => {
    setOpen(false);
    setStatus('connecting');
    if (STATIC) {
      const saved = writeLocalToken(token);
      if (!saved) {
        setStatus('upstream_error');
        return;
      }
      const probe = await probeBrowserToken(token);
      if (probe === 'subscription_expired') {
        setStatus('subscription_expired');
        return;
      }
      setStatus('ok');
      return;
    }
    const res = await fetch('/api/futoi/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const json = (await res.json()) as { error?: TokenStatus; status?: TokenStatus };
    if (json.error === 'subscription_expired') {
      setStatus('subscription_expired');
      return;
    }
    if (!res.ok && json.error === 'no_token') {
      setStatus('no_token');
      return;
    }
    setStatus('ok');
  }, []);

  return { status, open, setOpen, connect, refresh };
}
