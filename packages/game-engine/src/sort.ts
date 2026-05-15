import type { Card, CardColor, CardType } from '@uno/shared-types';

const powerOrder: Partial<Record<CardType, number>> = { wild4: 0, wild: 1, draw2: 2, reverse: 3, skip: 4 };
const colorOrder: Record<CardColor, number> = { blue: 0, green: 1, red: 2, yellow: 3, wild: 4 };

export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const ap = powerOrder[a.type];
    const bp = powerOrder[b.type];
    if (ap !== undefined || bp !== undefined) return (ap ?? 99) - (bp ?? 99) || a.id.localeCompare(b.id);
    return colorOrder[a.color] - colorOrder[b.color] || (a.value ?? 0) - (b.value ?? 0) || a.id.localeCompare(b.id);
  });
}
