'use client';

import { useEffect, useState } from 'react';
import {
  createExtensionBridge,
  ensureEmbedSession,
  hasEmbedSession,
  type ExtensionBridge,
} from '@finamx/extension-sdk';
import { createMockBridge } from '@finamx/extension-sdk/mock';

export function useBridge(extensionId: string): {
  bridge: ExtensionBridge | null;
  mock: boolean;
  error: string | null;
} {
  const [bridge, setBridge] = useState<ExtensionBridge | null>(null);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureEmbedSession();
    const hosted = hasEmbedSession();
    document.documentElement.dataset.boot = hosted ? 'wait' : 'standalone';
    const boot = hosted
      ? createExtensionBridge({ extensionId, invokeTimeoutMs: 120_000 })
      : Promise.resolve(
          createMockBridge({
            grantedScopes: ['ui.toast', 'user.profile.read'],
          }),
        );
    void boot
      .then((b) => {
        if (cancelled) return;
        setBridge(b);
        setMock(!hosted);
        setError(null);
        document.documentElement.dataset.boot = hosted ? 'host' : 'standalone';
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        document.documentElement.dataset.boot = 'error';
      });
    return () => {
      cancelled = true;
    };
  }, [extensionId]);

  return { bridge, mock, error };
}
