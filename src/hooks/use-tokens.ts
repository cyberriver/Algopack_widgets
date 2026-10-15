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

function paintTheme(value: unknown): void {
  const incoming = eventData(value);
  const theme =
    typeof incoming === 'string'
      ? incoming
      : incoming && typeof incoming === 'object'
        ? (incoming as { theme?: unknown }).theme
        : undefined;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
}

/** Токены хоста на html/body — иначе iframe остаётся белым, а карточка красится. Как code-nodes / terminal-op. */
export function useHostTokens(bridge: ExtensionBridge | null, target: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!bridge) return;
    const initial = bridge.hostContext?.uiTokens;
    if (initial) paint(initial, target);
    paintTheme(bridge.hostContext?.theme);
    const unsubTokens = bridge.platform.on(HOST_TOKENS_EVENT, (payload) => {
      const incoming = eventData(payload);
      if (!incoming || typeof incoming !== 'object') return;
      paint(incoming as Partial<UITokens>, target);
    });
    const unsubTheme = bridge.platform.on('theme.changed', paintTheme);
    return () => {
      unsubTokens();
      unsubTheme();
    };
  }, [bridge, target]);
}
