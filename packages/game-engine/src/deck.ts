import type { Card, CardColor } from '@uno/shared-types';

const colors: Exclude<CardColor, 'wild'>[] = ['red', 'yellow', 'green', 'blue'];
const actions = ['skip', 'reverse', 'draw2'] as const;

export function buildDeck(deckCount = 1): Card[] {
  const decks: Card[] = [];
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const color of colors) {
      decks.push({ id: `${deck}-${color}-0`, color, type: 'number', value: 0 });
      for (let copy = 0; copy < 2; copy += 1) {
        for (let value = 1; value <= 9; value += 1) decks.push({ id: `${deck}-${color}-${value}-${copy}`, color, type: 'number', value });
        for (const type of actions) decks.push({ id: `${deck}-${color}-${type}-${copy}`, color, type });
      }
    }
    for (let i = 0; i < 4; i += 1) {
      decks.push({ id: `${deck}-wild-${i}`, color: 'wild', type: 'wild' });
      decks.push({ id: `${deck}-wild4-${i}`, color: 'wild', type: 'wild4' });
    }
  }
  return decks;
}
