import { buildDeck } from './deck';
import { shuffle } from './rng';
import type { Card, GameEvent, GameState, Move, PlayColor, Player, RuleSet } from '@uno/shared-types';
import { defaultRuleSet } from '@uno/shared-types';

export interface CreateInitialStateInput {
  seed: string;
  players: Player[];
  rules?: Partial<RuleSet>;
  matchId?: string;
  /** Who opens after the starter card is shown (must be in `players`). Defaults to first seat. */
  firstPlayerId?: string;
}

export function stateChecksum(state: GameState): string {
  const stable = JSON.stringify({
    seed: state.seed,
    activePlayerId: state.activePlayerId,
    direction: state.direction,
    currentColor: state.currentColor,
    calledUno: state.calledUno,
    drawPile: state.drawPile.map((c) => c.id),
    discardPile: state.discardPile.map((c) => c.id),
    hands: Object.fromEntries(Object.entries(state.hands).map(([id, cards]) => [id, cards.map((c) => c.id)])),
    drawnPlayableOfferId: state.drawnPlayableOfferId,
    pendingDraw: state.pendingDraw,
  });
  return stableHash(stable);
}

export function createInitialState(input: CreateInitialStateInput): GameState {
  const rules = { ...defaultRuleSet, ...input.rules };
  const deck = shuffle(buildDeck(input.players.length > 10 ? 2 : 1), input.seed);
  const hands: Record<string, Card[]> = Object.fromEntries(input.players.map((p) => [p.id, [] as Card[]]));
  for (let round = 0; round < 7; round += 1) for (const player of input.players) hands[player.id].push(deck.shift()!);
  let starter = deck.shift()!;
  while (starter.type !== 'number') {
    deck.push(starter);
    starter = deck.shift()!;
  }
  const lead =
    input.firstPlayerId && input.players.some((p) => p.id === input.firstPlayerId)
      ? input.firstPlayerId
      : (input.players[0]?.id ?? '');
  return {
    matchId: input.matchId ?? `match-${input.seed}`,
    seed: input.seed,
    players: input.players,
    rules,
    status: 'playing',
    drawPile: deck,
    discardPile: [starter],
    hands,
    activePlayerId: lead,
    direction: 1,
    currentColor: starter.color as PlayColor,
    pendingDraw: 0,
    calledUno: {},
    eventLog: [],
  };
}

function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

export function canPlay(card: Card, state: GameState): boolean {
  const pending = state.pendingDraw ?? 0;
  // Progressive draw (stacking): while a pile is open you either take it or add to it. After a +2
  // you may stack +2 or Wild +4; after a Wild +4 only another Wild +4 may stack (+2 is not allowed).
  if (state.rules.stacking && pending > 0) {
    const top = topCard(state);
    if (top.type === 'wild4') return card.type === 'wild4';
    return card.type === 'draw2' || card.type === 'wild4';
  }
  const top = topCard(state);
  if (card.color === 'wild') return true;
  if (card.color === state.currentColor) return true;
  if (card.type === top.type && card.type !== 'number') return true;
  return card.type === 'number' && top.type === 'number' && card.value === top.value;
}

/** True if this viewer may click this card right now (respects the “only the card you drew” step after a draw). */
export function mayPlayCard(state: GameState, playerId: string, card: Card): boolean {
  if (state.status !== 'playing' || state.activePlayerId !== playerId) return false;
  const pending = state.pendingDraw ?? 0;
  // Stack responses must win over drawnPlayableOfferId — otherwise a stale offer id (e.g. from a
  // bad snapshot) disables +2/+4 in the hand UI even though legalMoves still lists those plays.
  if (state.rules.stacking && pending > 0) {
    return canPlay(card, state);
  }
  if (state.drawnPlayableOfferId && card.id !== state.drawnPlayableOfferId) return false;
  return canPlay(card, state);
}

/** Whether this player may press UNO right now (one card left, or two with a legal play on their turn). */
export function canCallUno(state: GameState, playerId: string): boolean {
  const hand = state.hands[playerId];
  if (!hand) return false;
  if (hand.length === 1) return true;
  if (hand.length === 2 && state.activePlayerId === playerId && hand.some((c) => mayPlayCard(state, playerId, c))) return true;
  return false;
}

export function legalMoves(state: GameState, playerId: string): Move[] {
  if (state.status !== 'playing' || state.activePlayerId !== playerId) return [];
  const pending = state.pendingDraw ?? 0;
  if (state.rules.stacking && pending > 0) {
    // Draw stack in play — stack with the allowed draw cards for what's on top, or take the pile with Draw.
    const hand = state.hands[playerId] ?? [];
    const plays = hand
      .filter((card) => canPlay(card, state))
      .map((card) => ({
        type: 'PLAY_CARD' as const,
        playerId,
        cardId: card.id,
        chosenColor: card.type === 'wild4' ? mostCommonColor(hand) : undefined,
      }));
    return [...plays, { type: 'DRAW_CARD' as const, playerId }];
  }
  if (state.drawnPlayableOfferId) {
    const card = state.hands[playerId]?.find((c) => c.id === state.drawnPlayableOfferId);
    if (!card || !canPlay(card, state)) return [{ type: 'PASS', playerId }];
    const play: Move = {
      type: 'PLAY_CARD',
      playerId,
      cardId: card.id,
      chosenColor: card.color === 'wild' ? mostCommonColor(state.hands[playerId]) : undefined,
    };
    return [play, { type: 'PASS', playerId }];
  }
  const plays = state.hands[playerId]
    .filter((card) => canPlay(card, state))
    .sort((a, b) => Number(a.type !== 'number') - Number(b.type !== 'number'))
    .map((card) => ({ type: 'PLAY_CARD' as const, playerId, cardId: card.id, chosenColor: card.color === 'wild' ? mostCommonColor(state.hands[playerId]) : undefined }));
  return [...plays, { type: 'DRAW_CARD', playerId }];
}

function mostCommonColor(cards: Card[]): PlayColor {
  const counts: Record<PlayColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of cards) if (card.color !== 'wild') counts[card.color] += 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as PlayColor;
}

function nextPlayerId(state: GameState, steps = 1): string {
  const ids = state.players.map((p) => p.id);
  const current = ids.indexOf(state.activePlayerId);
  return ids[(current + state.direction * steps + ids.length * 4) % ids.length];
}

/**
 * Seat that leads the next deal: one step from the winner in the direction the round ended in,
 * so the winner doesn’t open twice in a row.
 */
export function firstPlayerIdForNextRound(state: GameState): string {
  const ids = state.players.map((p) => p.id);
  if (ids.length === 0) return '';
  const w = state.winnerId;
  if (!w) return ids[0]!;
  const wIdx = ids.indexOf(w);
  if (wIdx < 0) return ids[0]!;
  const n = ids.length;
  return ids[(wIdx + state.direction + n * 8) % n]!;
}

/** When the draw pile is empty, turn everything under the face-up card into a new shuffled draw pile (standard UNO). */
function reshuffleDiscardIntoDraw(state: GameState, shuffleKey: string): void {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile[state.discardPile.length - 1]!;
  const under = state.discardPile.slice(0, -1);
  state.discardPile = [top];
  state.drawPile = [...state.drawPile, ...shuffle(under, `${state.seed}:${shuffleKey}`)];
}

// Pinia/Vue can nest reactive proxies inside the root state object; structuredClone throws on those.
// This state is plain JSON data (same shape we persist), so a round-trip gives a safe mutable copy.
function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function drawCards(state: GameState, playerId: string, count: number, shuffleKeyPrefix: string): GameState {
  const next = cloneState(state);
  for (let i = 0; i < count; i += 1) {
    if (next.drawPile.length === 0) reshuffleDiscardIntoDraw(next, `${shuffleKeyPrefix}:${i}`);
    const card = next.drawPile.shift();
    if (card) next.hands[playerId].push(card);
  }
  return next;
}

export function reduceGameEvent(state: GameState, event: GameEvent<Move>): GameState {
  const next = cloneState(state);
  const move = event.payload;
  if (move.type === 'CALL_UNO') {
    if (state.calledUno[move.playerId]) throw new Error('UNO already declared');
    if (!canCallUno(state, move.playerId)) throw new Error('Illegal UNO call');
    next.calledUno[move.playerId] = true;
    next.eventLog.push(event);
    return next;
  }
  if (event.playerId !== state.activePlayerId) throw new Error('Not this player turn');
  if (move.type === 'PASS') {
    if (!state.drawnPlayableOfferId) throw new Error('Nothing to pass on');
    delete next.drawnPlayableOfferId;
    next.activePlayerId = nextPlayerId(next);
    if (next.hands[event.playerId].length !== 1) delete next.calledUno[event.playerId];
    next.eventLog.push(event);
    return next;
  }
  if (move.type === 'DRAW_CARD') {
    if (state.drawnPlayableOfferId) throw new Error('Finish the drawn card or pass first');
    if (state.rules.stacking && (state.pendingDraw ?? 0) > 0) {
      // Draw here means "I'll take the stacked cards," not pull a single card off the deck.
      const pile = state.pendingDraw ?? 0;
      const drawn = drawCards(next, event.playerId, pile, `${event.eventId}:stack`);
      drawn.pendingDraw = 0;
      delete drawn.drawnPlayableOfferId;
      drawn.activePlayerId = nextPlayerId(drawn);
      if (drawn.hands[event.playerId].length !== 1) delete drawn.calledUno[event.playerId];
      drawn.eventLog.push(event);
      return drawn;
    }
    const drawn = drawCards(next, event.playerId, 1, `${event.eventId}:draw`);
    const handAfter = drawn.hands[event.playerId];
    const drawnCard = handAfter[handAfter.length - 1];
    if (!drawnCard) throw new Error('Draw pile was empty');
    if (canPlay(drawnCard, drawn)) {
      drawn.drawnPlayableOfferId = drawnCard.id;
    } else {
      delete drawn.drawnPlayableOfferId;
      drawn.activePlayerId = nextPlayerId(drawn);
    }
    if (drawn.hands[event.playerId].length !== 1) delete drawn.calledUno[event.playerId];
    drawn.eventLog.push(event);
    return drawn;
  }
  if (move.type !== 'PLAY_CARD') return next;
  const whoPlayed = event.playerId;
  if (state.drawnPlayableOfferId && move.cardId !== state.drawnPlayableOfferId) {
    throw new Error('Play the drawn card or pass');
  }
  const hand = next.hands[whoPlayed];
  const index = hand.findIndex((card) => card.id === move.cardId);
  if (index < 0) throw new Error('Card is not in hand');
  const [card] = hand.splice(index, 1);
  if (!canPlay(card, state)) throw new Error('Illegal card play');
  delete next.drawnPlayableOfferId;
  next.discardPile.push({ ...card });
  next.currentColor = card.color === 'wild' ? move.chosenColor ?? mostCommonColor(hand) : card.color;
  let steps = 1;
  if (card.type === 'reverse') next.direction = (next.direction * -1) as 1 | -1;
  if (card.type === 'skip') steps = 2;
  if (card.type === 'draw2' || card.type === 'wild4') {
    const n = card.type === 'draw2' ? 2 : 4;
    if (next.rules.stacking) {
      next.pendingDraw = (state.pendingDraw ?? 0) + n;
      steps = 1;
    } else {
      const target = nextPlayerId(next);
      const drawn = drawCards(next, target, n, `${event.eventId}:${card.type}`);
      Object.assign(next, drawn);
      steps = 2;
    }
  }
  // After Object.assign above, `hand` may point at a replaced hands array — always read the attacker from `next`.
  const attackerHand = next.hands[whoPlayed];
  if (attackerHand.length === 0) {
    next.status = 'finished';
    next.winnerId = whoPlayed;
  } else {
    next.activePlayerId = nextPlayerId(next, steps);
  }
  if (attackerHand.length === 1 && !next.calledUno[whoPlayed]) {
    const penalized = drawCards(next, whoPlayed, next.rules.unoPenaltyCards, `${event.eventId}:uno`);
    Object.assign(next, penalized);
    delete next.calledUno[whoPlayed];
  } else if (attackerHand.length !== 1) {
    delete next.calledUno[whoPlayed];
  }
  next.eventLog.push(event);
  return next;
}


function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 16777619);
    h2 ^= h1 >>> 7;
    h2 = Math.imul(h2, 2246822519);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
