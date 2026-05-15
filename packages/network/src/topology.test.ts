import { describe, expect, it } from 'vitest';
import { appendHashChainEvent, selectTopology } from './topology';

describe('selectTopology', () => {
  it('uses full mesh for small rooms', () => expect(selectTopology(6).kind).toBe('full-mesh'));
  it('uses selective mesh for medium rooms', () => expect(selectTopology(8).kind).toBe('selective-mesh'));
  it('uses host star for large rooms', () => expect(selectTopology(16).kind).toBe('host-star'));
});

describe('appendHashChainEvent', () => {
  it('chains events with previous hashes', () => {
    const first = appendHashChainEvent([], { eventId: '1', seq: 1, playerId: 'p1', type: 'CALL_UNO', timestamp: 1, payload: {}, sig: 'x' });
    const second = appendHashChainEvent(first, { eventId: '2', seq: 2, playerId: 'p1', type: 'DRAW_CARD', timestamp: 2, payload: {}, sig: 'x' });
    expect(second[1].prevHash).toBe(first[0].hash);
  });
});