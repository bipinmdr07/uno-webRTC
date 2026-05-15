import { io, type Socket } from 'socket.io-client';
import type { SignalOffer } from '@uno/shared-types';

export type SignalingIoTransport = 'polling' | 'websocket';

export class SignalingClient {
  private socket?: Socket;
  constructor(private readonly url: string) {}

  connect(
    roomId: string,
    playerId: string,
    onSignal: (signal: SignalOffer) => void,
    opts?: { transports?: SignalingIoTransport[] },
  ): void {
    const transports: SignalingIoTransport[] = opts?.transports?.length
      ? opts.transports
      : ['polling', 'websocket'];
    this.socket = io(`${this.url}/signal`, {
      transports,
      auth: { roomId, playerId },
    });
    this.socket.on('signal', onSignal);
  }

  send(signal: SignalOffer): void {
    this.socket?.emit('signal', signal);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
