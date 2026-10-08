'use client';

import { useLayoutEffect } from 'react';
import { HOST_TOKENS_EVENT, mergeUITokens, type UITokens } from '@finamx/bridge-protocol';
import type { ExtensionBridge } from '@finamx/extension-sdk';

function applyTokens(target: HTMLElement, tokens: UITokens): () => void {
  Object.entries(tokens.colors).forEach(([key, value]) => {
    target.style.setProperty(`--color-${key}`, value as string);
  });
  target.style.setProperty('--radius', tokens.radius);
  target.style.setProperty('--font-family', tokens.fontFamily);
  return () => {
    Object.keys(tokens.colors).forEach((key) => target.style.removeProperty(`--color-${key}`));
    target.style.removeProperty('--radius');
    target.style.removeProperty('--font-family');
  };
}

export function useHostTokens(bridge: ExtensionBridge | null, target: HTMLElement | null): void {
  const snapshot = bridge?.hostContext?.uiTokens ? JSON.stringify(bridge.hostContext.uiTokens) : null;

  useLayoutEffect(() => {
    if (!bridge || !target || !snapshot) return;
    const host = bridge.hostContext?.uiTokens;
    if (!host) return;
    const initial = mergeUITokens(host);
    let cleanup = applyTokens(target, initial);
    const unsub = bridge.platform.on(HOST_TOKENS_EVENT, (payload) => {
      const incoming = payload.data;
      if (!incoming || typeof incoming !== 'object') return;
      cleanup();
      cleanup = applyTokens(target, mergeUITokens(incoming as Partial<UITokens>));
    });
    return () => {
      unsub();
      cleanup();
    };
  }, [bridge, target, snapshot]);
}
