'use client';

import { useLayoutEffect } from 'react';
import { HOST_TOKENS_EVENT, type UITokens } from '@finamx/bridge-protocol';
import type { ExtensionBridge } from '@finamx/extension-sdk';
import { applyTokenVars, themeFromTokens } from '@/lib/host-tokens';

function eventData(e: unknown): unknown {
  if (e && typeof e === 'object') {
    const r = e as { data?: unknown; payload?: unknown };
    if (r.data !== undefined) return r.data;
    if (r.payload !== undefined) return r.payload;
  }
  return e;
}

function paint(partial: Partial<UITokens> | undefined, extra: HTMLElement | null): void {
  const roots = [document.documentElement, document.body, extra].filter((el): el is HTMLElement => Boolean(el));
  for (const el of roots) applyTokenVars(el, partial);
  document.documentElement.dataset.theme = themeFromTokens(partial);
}

/** Токены хоста на html/body — иначе iframe остаётся белым, а карточка красится. Как code-nodes / terminal-op. */
export function useHostTokens(bridge: ExtensionBridge | null, target: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!bridge) return;
    const initial = bridge.hostContext?.uiTokens;
    if (initial) paint(initial, target);
    const unsub = bridge.platform.on(HOST_TOKENS_EVENT, (payload) => {
      const incoming = eventData(payload);
      if (!incoming || typeof incoming !== 'object') return;
      paint(incoming as Partial<UITokens>, target);
    });
    return () => {
      unsub();
    };
  }, [bridge, target]);
}
