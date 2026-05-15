import SimplePeer from 'simple-peer';
import type { GameEvent } from '@uno/shared-types';

export function createPeerConnection(initiator: boolean, stream?: MediaStream): SimplePeer.Instance {
  return new SimplePeer({ initiator, trickle: true, stream, config: { iceServers: defaultIceServers() } });
}

export function defaultIceServers(): RTCIceServer[] {
  const raw = typeof process !== 'undefined' ? process.env.VITE_ICE_SERVERS : undefined;
  if (raw) {
    try {
      return JSON.parse(raw) as RTCIceServer[];
    } catch {
      // Bad ICE config should not block local development; fall back to public STUN.
    }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export function encodeReliableEvent(event: GameEvent): string {
  return JSON.stringify(event);
}

export function decodeReliableEvent(raw: string): GameEvent {
  return JSON.parse(raw) as GameEvent;
}
