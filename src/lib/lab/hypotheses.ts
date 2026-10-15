import type { HypothesisId, HypothesisRow, HypothesisStatus } from './types';

export const HYPOTHESIS_CATALOG: Array<{ id: HypothesisId; claim: string }> = [
  { id: 'H-MOVE', claim: 'По выбранному инструменту есть направленное движение / расширение диапазона' },
  { id: 'H-OI', claim: 'Это движение видно в открытом интересе' },
  { id: 'H-BRK', claim: 'Close за U+b / D−b — пробой зоны, а не шум внутри' },
  { id: 'H-CONF', claim: 'Пробой с ΔOI > 0 лучше цены одной (только свежий OI)' },
];

export function defaultHypotheses(): Record<HypothesisId, HypothesisRow> {
  const now = new Date().toISOString();
  return Object.fromEntries(
    HYPOTHESIS_CATALOG.map((h) => [
      h.id,
      { id: h.id, claim: h.claim, status: 'watching' as HypothesisStatus, updated_at: now },
    ]),
  ) as Record<HypothesisId, HypothesisRow>;
}
