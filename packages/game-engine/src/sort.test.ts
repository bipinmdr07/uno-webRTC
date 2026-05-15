import { describe, expect, it } from 'vitest';
import { sortHand } from './sort';
import type { Card } from '@uno/shared-types';

const c = (id: string, color: Card['color'], type: Card['type'], value?: number): Card => ({ id, color, type, value });

describe('sortHand', () => {
  it('puts power cards on the left, then color groups with ascending numbers', () => {
    const hand = [
      c('g8', 'green', 'number', 8),
      c('b6', 'blue', 'number', 6),
      c('skip-red', 'red', 'skip'),
      c('g1', 'green', 'number', 1),
      c('wild4', 'wild', 'wild4'),
      c('b0', 'blue', 'number', 0),
      c('draw2-blue', 'blue', 'draw2'),
      c('wild', 'wild', 'wild'),
      c('g5', 'green', 'number', 5),
      c('b2', 'blue', 'number', 2),
      c('reverse-green', 'green', 'reverse'),
      c('g2', 'green', 'number', 2),
    ];

    expect(sortHand(hand).map((card) => card.id)).toEqual([
      'wild4',
      'wild',
      'draw2-blue',
      'reverse-green',
      'skip-red',
      'b0',
      'b2',
      'b6',
      'g1',
      'g2',
      'g5',
      'g8',
    ]);
  });
});