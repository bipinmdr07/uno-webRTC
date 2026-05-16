import SimplePeer from 'simple-peer';
import type { GameEvent } from '@uno/shared-types';

/**
 * WebRTC wiring checklist (when you hook this up on the client):
 * - Call `peer.destroy()` on peer-left, room leave, and `pagehide` so ICE + channels don’t linger.
 * - Remove `on('data')` / `on('signal')` handlers if you add any, or leaks and duplicate events creep in.
 * - Close any attached MediaStream tracks when you add A/V.
 */
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
