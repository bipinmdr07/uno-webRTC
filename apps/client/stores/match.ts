import { defineStore } from 'pinia';
import { toRaw } from 'vue';
import { createInitialState, legalMoves, reduceGameEvent, stateChecksum } from '@uno/game-engine';
import type { GameEvent, GameState, Move, Player, Room } from '@uno/shared-types';

// One key per browser tab: a refresh keeps the match, but a fresh tab on the same
// room starts clean so old test sessions don't leak in.
const STORAGE_KEY = 'uno.match.snapshot';

interface PersistedMatch {
  roomId: string;
  state: GameState;
}

export const useMatchStore = defineStore('match', {
  state: () => ({ room: undefined as Room | undefined, state: undefined as GameState | undefined }),
  actions: {
    startLocal(players: Player[]) {
      this.state = createInitialState({ seed: this.room?.id ?? crypto.randomUUID(), players, rules: this.room?.rules });
      this.persist();
    },

    /** Same lobby, fresh deal. Host should broadcast the snapshot so everyone clears the finished hand log. */
    startNewRound(players: Player[], opts: { seed: string; firstPlayerId?: string }) {
      this.state = createInitialState({
        seed: opts.seed,
        players,
        rules: this.room?.rules,
        firstPlayerId: opts.firstPlayerId,
      });
      this.persist();
    },

    /**
     * Apply a move that originated on this client. Returns the wrapped event so the
     * caller can ship it to peers; we ship the whole event (not just the move) so
     * every client ends up with the same eventId / seq / prevHash in their log.
     */
    apply(move: Move): GameEvent<Move> | undefined {
      if (!this.state) return undefined;
      // Use the raw Pinia snapshot; the engine deep-clones with JSON so nested reactive proxies never break the reducer.
      const raw = toRaw(this.state);
      const event: GameEvent<Move> = {
        eventId: crypto.randomUUID(),
        seq: raw.eventLog.length + 1,
        playerId: move.playerId,
        type: move.type,
        timestamp: Date.now(),
        prevHash: stateChecksum(raw),
        sig: 'guest-dev',
        payload: move,
      };
      this.state = reduceGameEvent(raw, event);
      this.persist();
      return event;
    },

    /** Apply an event that came in over the wire from another peer. Duplicates are dropped by eventId. */
    applyRemoteEvent(event: GameEvent<Move>) {
      if (!this.state) return;
      const raw = toRaw(this.state);
      if (raw.eventLog.some((e) => e.eventId === event.eventId)) return;
      this.state = reduceGameEvent(raw, event);
      this.persist();
    },

    /** Adopt a snapshot a peer sent us — used when we join late or refresh and need to catch up. */
    loadSnapshot(snapshot: GameState) {
      this.state = snapshot;
      this.persist();
    },

    legal(playerId: string) { return this.state ? legalMoves(toRaw(this.state), playerId) : []; },

    persist() {
      if (typeof sessionStorage === 'undefined') return;
      const room = this.room;
      if (!room || !this.state) return;
      try {
        const payload: PersistedMatch = { roomId: room.id, state: toRaw(this.state) };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Storage might be full or blocked (private mode); losing the cache is fine,
        // peers will reconcile us via a snapshot when we reconnect.
      }
    },

    /** Try to restore the state for this room from sessionStorage. Returns true on success. */
    hydrate(roomId: string): boolean {
      if (typeof sessionStorage === 'undefined') return false;
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw) as PersistedMatch;
        if (saved.roomId !== roomId) return false;
        this.state = saved.state;
        return true;
      } catch {
        return false;
      }
    },

    clearPersisted() {
      if (typeof sessionStorage === 'undefined') return;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do if storage is sealed off */ }
    },
  },
});
