import { defaultUITokens, mergeUITokens, type UITokens } from '@finamx/bridge-protocol';

/** shadcn-хосты шлют тройку `H S% L%` — это не цвет, `background: var(--color-background)` тогда прозрачный. */
const BARE_HSL = /^-?[\d.]+(deg)?[\s,]+[\d.]+%[\s,]+[\d.]+%(\s*\/\s*[\d.]+%?)?$/i;

export function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  return BARE_HSL.test(v) ? `hsl(${v})` : v;
}

export function tokensToVars(partial: Partial<UITokens> | undefined): Record<string, string> {
  const t = mergeUITokens(partial ?? {});
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.colors)) {
    out[`--color-${k}`] = normalizeColor(v) || normalizeColor(defaultUITokens.colors[k as keyof UITokens['colors']]);
  }
  const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  if (same(out['--color-border'], out['--color-foreground'])) {
    out['--color-border'] = `color-mix(in srgb, ${out['--color-foreground']} 14%, ${out['--color-background']})`;
  }
  if (same(out['--color-muted-foreground'], out['--color-foreground'])) {
    out['--color-muted-foreground'] = `color-mix(in srgb, ${out['--color-foreground']} 56%, ${out['--color-background']})`;
  }
  out['--radius'] = String(t.radius || defaultUITokens.radius);
  out['--font-family'] = String(t.fontFamily || defaultUITokens.fontFamily);
  return out;
}

export function themeFromTokens(partial: Partial<UITokens> | undefined): 'light' | 'dark' {
  const raw = normalizeColor(partial?.colors?.background ?? defaultUITokens.colors.background);
  const m = /^hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+([\d.]+)%/i.exec(raw);
  if (m) return +m[1] < 50 ? 'dark' : 'light';
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5 ? 'dark' : 'light';
  }
  return 'light';
}

export function applyTokenVars(target: HTMLElement, partial: Partial<UITokens> | undefined): void {
  for (const [name, value] of Object.entries(tokensToVars(partial))) {
    target.style.setProperty(name, value);
  }
}

export function readToken(el: HTMLElement | null, name: string, fallback: string): string {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}
