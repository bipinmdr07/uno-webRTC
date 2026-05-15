import type { Card, GameState, Player } from '@uno/shared-types';

/** Classic UNO scoring: numbers face value, action cards 20, wilds 50. */
export function pointsForCard(card: Card): number {
  if (card.type === 'number') return card.value ?? 0;
  if (card.type === 'draw2' || card.type === 'reverse' || card.type === 'skip') return 20;
  return 50;
}

export function pointsInHand(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + pointsForCard(c), 0);
}

export interface RoundStandingRow {
  rank: number;
  player: Player;
  /** Sum of card values left in this player’s hand when the round ended (0 for the winner). */
  handPoints: number;
}

/**
 * Everyone’s leftover hand is scored; lower is better. Used for the end-of-game
 * leaderboard so all clients sort the same way from the shared `GameState`.
 */
export function finishedRoundStandings(state: GameState): RoundStandingRow[] {
  const rows = state.players.map((player) => ({
    player,
    handPoints: pointsInHand(state.hands[player.id] ?? []),
  }));
  rows.sort((a, b) => {
    if (a.handPoints !== b.handPoints) return a.handPoints - b.handPoints;
    return a.player.username.localeCompare(b.player.username);
  });
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}
