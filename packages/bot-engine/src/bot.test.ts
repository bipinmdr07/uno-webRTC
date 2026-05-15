import { describe, expect, it } from 'vitest';
import { chooseBotMove } from './bot';
import { createInitialState, legalMoves } from '@uno/game-engine';
import type { Player } from '@uno/shared-types';

const players: Player[] = [
  { id: 'bot', username: 'Bot', avatar: 'robot', connected: true, score: 0 },
  { id: 'p2', username: 'Human', avatar: 'human', connected: true, score: 0 },
];

describe('chooseBotMove', () => {
  it.each(['easy', 'medium', 'hard', 'expert'] as const)('returns a legal move for %s bots', (difficulty) => {
    const state = createInitialState({ seed: difficulty, players });
    const move = chooseBotMove(state, state.activePlayerId, difficulty);
    expect(legalMoves(state, state.activePlayerId)).toContainEqual(move);
  });
});