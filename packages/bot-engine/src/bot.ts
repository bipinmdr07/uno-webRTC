import { legalMoves, sortHand } from '@uno/game-engine';
import type { Card, GameState, Move } from '@uno/shared-types';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

const powerScore: Record<Card['type'], number> = { wild4: 60, wild: 50, draw2: 40, reverse: 30, skip: 25, number: 1 };

export function chooseBotMove(state: GameState, playerId: string, difficulty: BotDifficulty): Move {
  const moves = legalMoves(state, playerId);
  if (moves.length === 0) throw new Error('No legal moves available');
  const playMoves = moves.filter((move) => move.type === 'PLAY_CARD');
  if (difficulty === 'easy') return moves[Math.abs(hash(`${state.seed}:${playerId}`)) % moves.length];
  if (playMoves.length === 0) {
    const draw = moves.find((m) => m.type === 'DRAW_CARD');
    if (draw) return draw;
    const pass = moves.find((m) => m.type === 'PASS');
    if (pass) return pass;
    throw new Error('No legal moves available');
  }
  const hand = state.hands[playerId];
  const cardById = new Map(hand.map((card) => [card.id, card]));
  return [...playMoves].sort((a, b) => scoreMove(b, cardById, difficulty) - scoreMove(a, cardById, difficulty))[0];
}

export function botDelayMs(difficulty: BotDifficulty): number {
  return { easy: 1200, medium: 900, hard: 650, expert: 500 }[difficulty];
}

function scoreMove(move: Move, cards: Map<string, Card>, difficulty: BotDifficulty): number {
  if (move.type !== 'PLAY_CARD') return 0;
  const card = cards.get(move.cardId)!;
  const base = powerScore[card.type] + (card.value ?? 0);
  if (difficulty === 'medium') return card.type === 'number' ? card.value ?? 0 : base;
  if (difficulty === 'hard') return base;
  const scarcityPenalty = sortHand([...cards.values()]).filter((c) => c.color === card.color).length <= 2 ? -10 : 0;
  return base + scarcityPenalty;
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = Math.imul(31, h) + input.charCodeAt(i);
  return h;
}
