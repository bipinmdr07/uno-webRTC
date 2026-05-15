import { describe, expect, it } from 'vitest';
import { defaultRuleSet } from '@uno/shared-types';
import {
  canCallUno,
  canPlay,
  createInitialState,
  firstPlayerIdForNextRound,
  legalMoves,
  mayPlayCard,
  reduceGameEvent,
  stateChecksum,
} from './engine';
import type { Card, GameState, Player } from '@uno/shared-types';

const players: Player[] = [
  { id: 'p1', username: 'Ada', avatar: 'a', connected: true, score: 0 },
  { id: 'p2', username: 'Ben', avatar: 'b', connected: true, score: 0 },
];

describe('deterministic UNO engine', () => {
  it('deals identical games from identical seeds', () => {
    const a = createInitialState({ seed: 'room-match', players });
    const b = createInitialState({ seed: 'room-match', players });
    expect(a.hands).toEqual(b.hands);
    expect(stateChecksum(a)).toBe(stateChecksum(b));
  });

  it('honors firstPlayerId for the opening turn', () => {
    const s = createInitialState({ seed: 'lead-seat', players, firstPlayerId: 'p2' });
    expect(s.activePlayerId).toBe('p2');
  });

  it('only exposes legal play and draw moves for the active player', () => {
    const state = createInitialState({ seed: 'legal-moves', players });
    const moves = legalMoves(state, state.activePlayerId);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.playerId === state.activePlayerId)).toBe(true);
    expect(moves.some((move) => move.type === 'DRAW_CARD')).toBe(true);
  });

  it('applies play-card events by moving the card to discard and advancing turn', () => {
    const state = createInitialState({ seed: 'play-card', players });
    const move = legalMoves(state, state.activePlayerId).find((m) => m.type === 'PLAY_CARD');
    expect(move).toBeDefined();
    const next = reduceGameEvent(state, {
      eventId: 'evt_1',
      seq: 1,
      playerId: state.activePlayerId,
      type: 'PLAY_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: move!,
    });
    expect(next.discardPile.at(-1)?.id).toBe(move?.cardId);
    expect(next.activePlayerId).not.toBe(state.activePlayerId);
  });

  it('passes turn after a plain Wild once the color is chosen', () => {
    const wild: Card = { id: 'wild-test', color: 'wild', type: 'wild' };
    const state: GameState = {
      matchId: 'm',
      seed: 's',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [wild, { id: 'r5', color: 'red', type: 'number', value: 5 }],
        p2: [{ id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const next = reduceGameEvent(state, {
      eventId: 'evt_wild',
      seq: 1,
      playerId: 'p1',
      type: 'PLAY_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p1', cardId: wild.id, chosenColor: 'green' },
    });
    expect(next.activePlayerId).toBe('p2');
  });

  it('in a two-hand game, Wild Draw 4 lets the opponent take the stack or draw it all', () => {
    const w4: Card = { id: 'w4-test', color: 'wild', type: 'wild4' };
    const state: GameState = {
      matchId: 'm',
      seed: 's',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, color: 'yellow', type: 'number' as const, value: 1 })),
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [
          w4,
          { id: 'r5', color: 'red', type: 'number', value: 5 },
        ],
        p2: [{ id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const afterW4 = reduceGameEvent(state, {
      eventId: 'evt_w4',
      seq: 1,
      playerId: 'p1',
      type: 'PLAY_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p1', cardId: w4.id, chosenColor: 'blue' },
    });
    expect(afterW4.activePlayerId).toBe('p2');
    expect(afterW4.pendingDraw).toBe(4);
    expect(afterW4.hands.p2).toHaveLength(1);
    const afterDraw = reduceGameEvent(afterW4, {
      eventId: 'evt_take',
      seq: 2,
      playerId: 'p2',
      type: 'DRAW_CARD',
      timestamp: 2,
      prevHash: stateChecksum(afterW4),
      sig: 'dev',
      payload: { type: 'DRAW_CARD', playerId: 'p2' },
    });
    expect(afterDraw.activePlayerId).toBe('p1');
    expect(afterDraw.pendingDraw).toBe(0);
    expect(afterDraw.hands.p2.length).toBeGreaterThanOrEqual(5);
  });

  it('canCallUno: one card always, or two on your turn when at least one card is legal', () => {
    const state: GameState = {
      matchId: 'm',
      seed: 's',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [
          { id: 'r5', color: 'red', type: 'number', value: 5 },
          { id: 'b2', color: 'blue', type: 'number', value: 2 },
        ],
        p2: [
          { id: 'g4', color: 'green', type: 'number', value: 4 },
          { id: 'g5', color: 'green', type: 'number', value: 5 },
        ],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    expect(canCallUno(state, 'p1')).toBe(true);
    expect(canCallUno(state, 'p2')).toBe(false);
    const onlyBlue: GameState = {
      ...state,
      hands: {
        p1: [
          { id: 'b4', color: 'blue', type: 'number', value: 4 },
          { id: 'b8', color: 'blue', type: 'number', value: 8 },
        ],
        p2: state.hands.p2,
      },
    };
    expect(canCallUno(onlyBlue, 'p1')).toBe(false);
    const p2One: GameState = {
      ...state,
      activePlayerId: 'p2',
      hands: { p1: state.hands.p1, p2: [{ id: 'r1', color: 'red', type: 'number', value: 1 }] },
    };
    expect(canCallUno(p2One, 'p2')).toBe(true);
  });

  it('deals the UNO penalty when you play down to one card without declaring first', () => {
    const state: GameState = {
      matchId: 'm',
      seed: 's',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [
        { id: 'pen1', color: 'yellow', type: 'number', value: 1 },
        { id: 'pen2', color: 'yellow', type: 'number', value: 2 },
      ],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [
          { id: 'r5', color: 'red', type: 'number', value: 5 },
          { id: 'r7', color: 'red', type: 'number', value: 7 },
        ],
        p2: [{ id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const next = reduceGameEvent(state, {
      eventId: 'evt_play',
      seq: 1,
      playerId: 'p1',
      type: 'PLAY_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'r7' },
    });
    expect(next.hands.p1.map((c) => c.id).sort()).toEqual(['pen1', 'pen2', 'r5'].sort());
    expect(next.drawPile).toHaveLength(0);
  });

  it('skips the UNO penalty when you already declared with two cards', () => {
    let state: GameState = {
      matchId: 'm',
      seed: 's',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [
        { id: 'pen1', color: 'yellow', type: 'number', value: 1 },
        { id: 'pen2', color: 'yellow', type: 'number', value: 2 },
      ],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [
          { id: 'r5', color: 'red', type: 'number', value: 5 },
          { id: 'r7', color: 'red', type: 'number', value: 7 },
        ],
        p2: [{ id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    state = reduceGameEvent(state, {
      eventId: 'evt_uno',
      seq: 1,
      playerId: 'p1',
      type: 'CALL_UNO',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'CALL_UNO', playerId: 'p1' },
    });
    const next = reduceGameEvent(state, {
      eventId: 'evt_play',
      seq: 2,
      playerId: 'p1',
      type: 'PLAY_CARD',
      timestamp: 2,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'r7' },
    });
    expect(next.hands.p1.map((c) => c.id)).toEqual(['r5']);
    expect(next.drawPile.map((c) => c.id)).toEqual(['pen1', 'pen2']);
  });

  it('removes drawn cards from the draw pile when Draw Two is played (no stacking)', () => {
    const state: GameState = {
      matchId: 'm',
      seed: 'deck-seed',
      players,
      rules: { ...defaultRuleSet, stacking: false },
      status: 'playing',
      drawPile: [
        { id: 'd1', color: 'yellow', type: 'number', value: 1 },
        { id: 'd2', color: 'yellow', type: 'number', value: 2 },
        { id: 'd3', color: 'yellow', type: 'number', value: 3 },
      ],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [{ id: 'r-d2', color: 'red', type: 'draw2' }],
        p2: [{ id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const next = reduceGameEvent(state, {
      eventId: 'evt_d2',
      seq: 1,
      playerId: 'p1',
      type: 'PLAY_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'r-d2' },
    });
    expect(next.drawPile).toHaveLength(1);
    expect(next.drawPile.map((c) => c.id)).toEqual(['d3']);
    expect(next.hands.p2.map((c) => c.id).sort()).toEqual(['b2', 'd1', 'd2'].sort());
  });

  it('stacks Draw Two and Wild Draw Four until someone draws the pile', () => {
    const three: Player[] = [
      ...players,
      { id: 'p3', username: 'Cam', avatar: 'c', connected: true, score: 0 },
    ];
    const state: GameState = {
      matchId: 'm',
      seed: 'stack-seed',
      players: three,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: Array.from({ length: 12 }, (_, i) => ({
        id: `deck${i}`,
        color: 'yellow' as const,
        type: 'number' as const,
        value: 1,
      })),
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [
          { id: 'r-d2', color: 'red', type: 'draw2' },
          { id: 'r5', color: 'red', type: 'number', value: 5 },
          { id: 'r7', color: 'red', type: 'number', value: 7 },
        ],
        p2: [
          { id: 'g-d2', color: 'green', type: 'draw2' },
          { id: 'b2', color: 'blue', type: 'number', value: 2 },
        ],
        p3: [
          { id: 'w4', color: 'wild', type: 'wild4' },
          { id: 'g1', color: 'green', type: 'number', value: 1 },
        ],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const s1 = reduceGameEvent(state, {
      eventId: 'e1',
      seq: 1,
      playerId: 'p1',
      type: 'PLAY_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'r-d2' },
    });
    expect(s1.pendingDraw).toBe(2);
    expect(s1.activePlayerId).toBe('p2');
    const s2 = reduceGameEvent(s1, {
      eventId: 'e2',
      seq: 2,
      playerId: 'p2',
      type: 'PLAY_CARD',
      timestamp: 2,
      prevHash: stateChecksum(s1),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p2', cardId: 'g-d2' },
    });
    expect(s2.pendingDraw).toBe(4);
    expect(s2.activePlayerId).toBe('p3');
    const s3 = reduceGameEvent(s2, {
      eventId: 'e3',
      seq: 3,
      playerId: 'p3',
      type: 'PLAY_CARD',
      timestamp: 3,
      prevHash: stateChecksum(s2),
      sig: 'dev',
      payload: { type: 'PLAY_CARD', playerId: 'p3', cardId: 'w4', chosenColor: 'blue' },
    });
    expect(s3.pendingDraw).toBe(8);
    expect(s3.activePlayerId).toBe('p1');
    const s4 = reduceGameEvent(s3, {
      eventId: 'e4',
      seq: 4,
      playerId: 'p1',
      type: 'DRAW_CARD',
      timestamp: 4,
      prevHash: stateChecksum(s3),
      sig: 'dev',
      payload: { type: 'DRAW_CARD', playerId: 'p1' },
    });
    expect(s4.pendingDraw).toBe(0);
    expect(s4.hands.p1).toHaveLength(10);
    expect(s4.activePlayerId).toBe('p2');
  });

  it('mayPlayCard treats draw-stack over a stale drawnPlayableOfferId so +2/+4 stay clickable', () => {
    const gD2: Card = { id: 'g-d2', color: 'green', type: 'draw2' };
    const state: GameState = {
      matchId: 'm',
      seed: 'stack-ui',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: Array.from({ length: 10 }, (_, i) => ({
        id: `d${i}`,
        color: 'yellow' as const,
        type: 'number' as const,
        value: 1,
      })),
      discardPile: [{ id: 'r-d2', color: 'red', type: 'draw2' }],
      hands: {
        p1: [{ id: 'r5', color: 'red', type: 'number', value: 5 }],
        p2: [gD2, { id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p2',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 2,
      drawnPlayableOfferId: 'ghost-id-should-not-block-stack',
      calledUno: {},
      eventLog: [],
    };
    expect(mayPlayCard(state, 'p2', gD2)).toBe(true);
    const moves = legalMoves(state, 'p2');
    expect(moves.some((m) => m.type === 'PLAY_CARD' && m.cardId === 'g-d2')).toBe(true);
    expect(moves.some((m) => m.type === 'DRAW_CARD')).toBe(true);
  });

  it('after Wild +4 on the stack, only another Wild +4 may stack (not +2)', () => {
    const rD2: Card = { id: 'r-d2', color: 'red', type: 'draw2' };
    const w4: Card = { id: 'w4', color: 'wild', type: 'wild4' };
    const state: GameState = {
      matchId: 'm',
      seed: 'w4-top',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }, w4],
      hands: {
        p1: [],
        p2: [rD2, { id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p2',
      direction: 1,
      currentColor: 'blue',
      pendingDraw: 4,
      calledUno: {},
      eventLog: [],
    };
    expect(canPlay(rD2, state)).toBe(false);
    expect(canPlay(w4, state)).toBe(true);
    const moves = legalMoves(state, 'p2');
    expect(moves.some((m) => m.type === 'PLAY_CARD' && m.cardId === 'r-d2')).toBe(false);
    expect(moves.some((m) => m.type === 'DRAW_CARD')).toBe(true);
  });

  it('reshuffles discard under the top card when the draw pile runs out', () => {
    const state: GameState = {
      matchId: 'm',
      seed: 'reshuffle-seed',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [] as Card[],
      discardPile: [
        { id: 'u1', color: 'green', type: 'number', value: 1 },
        { id: 'u2', color: 'green', type: 'number', value: 2 },
        { id: 'face', color: 'red', type: 'number', value: 9 },
      ],
      hands: {
        p1: [{ id: 'r3', color: 'red', type: 'number', value: 3 }],
        p2: [{ id: 'b4', color: 'blue', type: 'number', value: 4 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const next = reduceGameEvent(state, {
      eventId: 'evt_draw',
      seq: 1,
      playerId: 'p1',
      type: 'DRAW_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'DRAW_CARD', playerId: 'p1' },
    });
    expect(next.discardPile.map((c) => c.id)).toEqual(['face']);
    expect(next.drawPile).toHaveLength(1);
    expect(['u1', 'u2']).toContain(next.hands.p1.at(-1)?.id);
    expect(next.activePlayerId).toBe('p2');
  });

  it('keeps your turn when the drawn card matches, and you may play it or pass', () => {
    const state: GameState = {
      matchId: 'm',
      seed: 'draw-play',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [{ id: 'r5', color: 'red', type: 'number' as const, value: 5 }],
      discardPile: [{ id: 'top', color: 'red', type: 'number' as const, value: 3 }],
      hands: {
        p1: [{ id: 'b2', color: 'blue', type: 'number' as const, value: 2 }],
        p2: [{ id: 'g1', color: 'green', type: 'number' as const, value: 1 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const afterDraw = reduceGameEvent(state, {
      eventId: 'evt_d',
      seq: 1,
      playerId: 'p1',
      type: 'DRAW_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'DRAW_CARD', playerId: 'p1' },
    });
    expect(afterDraw.activePlayerId).toBe('p1');
    expect(afterDraw.drawnPlayableOfferId).toBe('r5');
    expect(afterDraw.hands.p1.map((c) => c.id).sort()).toEqual(['b2', 'r5'].sort());
    const opts = legalMoves(afterDraw, 'p1');
    expect(opts.some((m) => m.type === 'PLAY_CARD' && m.cardId === 'r5')).toBe(true);
    expect(opts.some((m) => m.type === 'PASS')).toBe(true);
    expect(opts.some((m) => m.type === 'DRAW_CARD')).toBe(false);
    const afterPass = reduceGameEvent(afterDraw, {
      eventId: 'evt_p',
      seq: 2,
      playerId: 'p1',
      type: 'PASS',
      timestamp: 2,
      prevHash: stateChecksum(afterDraw),
      sig: 'dev',
      payload: { type: 'PASS', playerId: 'p1' },
    });
    expect(afterPass.activePlayerId).toBe('p2');
    expect(afterPass.drawnPlayableOfferId).toBeUndefined();
    expect(afterPass.hands.p1.map((c) => c.id).sort()).toEqual(['b2', 'r5'].sort());
  });

  it('rejects drawing again until you play or pass on a playable draw', () => {
    const state: GameState = {
      matchId: 'm',
      seed: 'double-draw',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [
        { id: 'r5', color: 'red', type: 'number' as const, value: 5 },
        { id: 'y1', color: 'yellow', type: 'number' as const, value: 1 },
      ],
      discardPile: [{ id: 'top', color: 'red', type: 'number' as const, value: 3 }],
      hands: {
        p1: [{ id: 'b2', color: 'blue', type: 'number' as const, value: 2 }],
        p2: [{ id: 'g1', color: 'green', type: 'number' as const, value: 1 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    const afterDraw = reduceGameEvent(state, {
      eventId: 'evt_d',
      seq: 1,
      playerId: 'p1',
      type: 'DRAW_CARD',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'DRAW_CARD', playerId: 'p1' },
    });
    expect(() =>
      reduceGameEvent(afterDraw, {
        eventId: 'evt_d2',
        seq: 2,
        playerId: 'p1',
        type: 'DRAW_CARD',
        timestamp: 2,
        prevHash: stateChecksum(afterDraw),
        sig: 'dev',
        payload: { type: 'DRAW_CARD', playerId: 'p1' },
      }),
    ).toThrow(/Finish the drawn card/);
  });

  it('rejects a second UNO declaration from the same streak', () => {
    let state: GameState = {
      matchId: 'm',
      seed: 's',
      players,
      rules: defaultRuleSet,
      status: 'playing',
      drawPile: [],
      discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
      hands: {
        p1: [{ id: 'r5', color: 'red', type: 'number', value: 5 }],
        p2: [{ id: 'b2', color: 'blue', type: 'number', value: 2 }],
      },
      activePlayerId: 'p1',
      direction: 1,
      currentColor: 'red',
      pendingDraw: 0,
      calledUno: {},
      eventLog: [],
    };
    state = reduceGameEvent(state, {
      eventId: 'u1',
      seq: 1,
      playerId: 'p1',
      type: 'CALL_UNO',
      timestamp: 1,
      prevHash: stateChecksum(state),
      sig: 'dev',
      payload: { type: 'CALL_UNO', playerId: 'p1' },
    });
    expect(() =>
      reduceGameEvent(state, {
        eventId: 'u2',
        seq: 2,
        playerId: 'p1',
        type: 'CALL_UNO',
        timestamp: 2,
        prevHash: stateChecksum(state),
        sig: 'dev',
        payload: { type: 'CALL_UNO', playerId: 'p1' },
      }),
    ).toThrow(/already declared/);
  });

  it('first seat for the next round follows the winner in the current direction', () => {
    const three: Player[] = [
      { id: 'a', username: 'A', avatar: '1', connected: true, score: 0 },
      { id: 'b', username: 'B', avatar: '2', connected: true, score: 0 },
      { id: 'c', username: 'C', avatar: '3', connected: true, score: 0 },
    ];
    const base = createInitialState({ seed: 'next-round', players: three });
    const finishedCw: GameState = { ...base, status: 'finished', winnerId: 'b', direction: 1 };
    expect(firstPlayerIdForNextRound(finishedCw)).toBe('c');
    const finishedCcw: GameState = { ...base, status: 'finished', winnerId: 'b', direction: -1 };
    expect(firstPlayerIdForNextRound(finishedCcw)).toBe('a');
  });
});