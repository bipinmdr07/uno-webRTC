import { describe, expect, it } from 'vitest';
import type { Card, GameState, Player } from '@uno/shared-types';
import { defaultRuleSet } from '@uno/shared-types';
import { finishedRoundStandings, pointsForCard, pointsInHand } from './scoring';

const p = (id: string, name: string): Player => ({
  id,
  username: name,
  avatar: '🎮',
  connected: true,
  score: 0,
});

describe('pointsForCard', () => {
  it('scores number cards by face value', () => {
    expect(pointsForCard({ id: '1', color: 'red', type: 'number', value: 7 })).toBe(7);
    expect(pointsForCard({ id: '2', color: 'blue', type: 'number', value: 0 })).toBe(0);
  });
  it('scores action cards at 20', () => {
    expect(pointsForCard({ id: '3', color: 'yellow', type: 'skip' })).toBe(20);
    expect(pointsForCard({ id: '4', color: 'green', type: 'reverse' })).toBe(20);
    expect(pointsForCard({ id: '5', color: 'red', type: 'draw2' })).toBe(20);
  });
  it('scores wild cards at 50', () => {
    expect(pointsForCard({ id: '6', color: 'wild', type: 'wild' })).toBe(50);
    expect(pointsForCard({ id: '7', color: 'wild', type: 'wild4' })).toBe(50);
  });
});

describe('finishedRoundStandings', () => {
  it('orders by hand points ascending (winner first with 0)', () => {
    const winner = p('w', 'Winner');
    const loserHeavy = p('h', 'Heavy');
    const loserLight = p('l', 'Light');
    const red7: Card = { id: 'c1', color: 'red', type: 'number', value: 7 };
    const wild: Card = { id: 'c2', color: 'wild', type: 'wild4' };
    const yellow2: Card = { id: 'c3', color: 'yellow', type: 'number', value: 2 };
    const state = {
      matchId: 'm1',
      seed: 's',
      players: [winner, loserHeavy, loserLight],
      rules: { ...defaultRuleSet },
      status: 'finished' as const,
      drawPile: [],
      discardPile: [],
      hands: {
        w: [],
        h: [wild],
        l: [yellow2, red7],
      },
      activePlayerId: 'w',
      direction: 1 as const,
      currentColor: 'red' as const,
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
      winnerId: 'w',
    } satisfies GameState;

    const rows = finishedRoundStandings(state);
    expect(rows.map((r) => r.player.id)).toEqual(['w', 'l', 'h']);
    expect(rows.map((r) => r.handPoints)).toEqual([0, 9, 50]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('pointsInHand', () => {
  it('sums a hand', () => {
    const cards: Card[] = [
      { id: 'a', color: 'green', type: 'number', value: 3 },
      { id: 'b', color: 'blue', type: 'skip' },
    ];
    expect(pointsInHand(cards)).toBe(23);
  });
});
