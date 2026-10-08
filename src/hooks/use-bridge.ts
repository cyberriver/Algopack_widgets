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
} {
  const [bridge, setBridge] = useState<ExtensionBridge | null>(null);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureEmbedSession();
    const boot = hasEmbedSession()
      ? createExtensionBridge({ extensionId })
      : Promise.resolve(
          createMockBridge({
            grantedScopes: ['ui.toast', 'user.profile.read'],
          }),
        );
    void boot.then((b) => {
      if (cancelled) return;
      setBridge(b);
      setMock(!hasEmbedSession());
    });
    return () => {
      cancelled = true;
    };
  }, [extensionId]);

  return { bridge, mock };
}
