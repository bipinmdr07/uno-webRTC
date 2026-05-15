import type { GameEvent } from '@uno/shared-types';

export type NetworkTopology =
  | { kind: 'full-mesh'; maxPeers: 6 }
  | { kind: 'selective-mesh'; maxPeers: 10; unreliableFanout: number }
  | { kind: 'host-star'; maxPeers: 16; relayFallback: true };

export function selectTopology(playerCount: number): NetworkTopology {
  if (playerCount <= 6) return { kind: 'full-mesh', maxPeers: 6 };
  if (playerCount <= 10) return { kind: 'selective-mesh', maxPeers: 10, unreliableFanout: 4 };
  return { kind: 'host-star', maxPeers: 16, relayFallback: true };
}

export interface HashedEvent<T = unknown> extends GameEvent<T> { hash: string }

export function appendHashChainEvent<T>(chain: HashedEvent[], event: GameEvent<T>): HashedEvent[] {
  const prevHash = chain.at(-1)?.hash ?? 'genesis';
  const hash = stableHash(JSON.stringify({ ...event, prevHash }));
  return [...chain, { ...event, prevHash, hash }];
}

export function checksumEvents(events: readonly HashedEvent[]): string {
  return events.at(-1)?.hash ?? 'genesis';
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
