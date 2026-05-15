import { defineStore } from 'pinia';
import { SignalingClient, selectTopology, type SignalingIoTransport } from '@uno/network';
import type { GameEvent, GameState, Move, NetworkMetrics, SignalOffer } from '@uno/shared-types';

// The SignalingClient owns a live socket, so we keep it out of Pinia state where the
// reactivity proxy would otherwise wrap (and break) it.
let signaling: SignalingClient | undefined;

export type RelayPayload =
  | { kind: 'event'; event: GameEvent<Move> }
  | { kind: 'snapshot'; state: GameState };

export const useNetworkStore = defineStore('network', {
  state: () => ({
    connected: false,
    metrics: { rttMs: 0, packetLoss: 0, reconnectAttempts: 0, desyncCount: 0 } as NetworkMetrics,
    topology: selectTopology(1),
    roomId: '',
    playerId: '',
  }),
  actions: {
    connect(
      url: string,
      roomId: string,
      playerId: string,
      onSignal: (signal: SignalOffer) => void,
      opts?: { transports?: SignalingIoTransport[] },
    ) {
      // Replace any previous client cleanly so HMR / re-mounts don't leak sockets.
      signaling?.disconnect();
      signaling = new SignalingClient(url);
      signaling.connect(roomId, playerId, onSignal, opts);
      this.roomId = roomId;
      this.playerId = playerId;
      this.connected = true;
    },

    /** Ship a freshly-applied move to every other peer in the room. */
    relayEvent(event: GameEvent<Move>) {
      if (!signaling) return;
      const payload: RelayPayload = { kind: 'event', event };
      signaling.send({ type: 'relay-event', roomId: this.roomId, from: this.playerId, payload });
    },

    /** Send a full state snapshot — typically in response to a peer joining or rejoining. */
    relaySnapshot(state: GameState, to?: string) {
      if (!signaling) return;
      const payload: RelayPayload = { kind: 'snapshot', state };
      signaling.send({ type: 'relay-event', roomId: this.roomId, from: this.playerId, to, payload });
    },

    disconnect() {
      signaling?.disconnect();
      signaling = undefined;
      this.connected = false;
    },
  },
});
