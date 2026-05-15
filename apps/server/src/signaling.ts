import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { SignalOffer } from '@uno/shared-types';

export function attachSignaling(httpServer: HttpServer): Server {
  const io = new Server(httpServer, { cors: { origin: '*' } });
  const nsp = io.of('/signal');
  nsp.on('connection', (socket) => {
    const roomId = String(socket.handshake.auth.roomId ?? '');
    const playerId = String(socket.handshake.auth.playerId ?? socket.id);
    if (!roomId) { socket.disconnect(true); return; }
    socket.join(roomId);
    socket.to(roomId).emit('signal', { type: 'peer-joined', roomId, from: playerId, payload: { socketId: socket.id } } satisfies SignalOffer);
    socket.on('signal', (signal: SignalOffer) => socket.to(roomId).emit('signal', signal));
    socket.on('disconnect', () => socket.to(roomId).emit('signal', { type: 'peer-left', roomId, from: playerId, payload: {} } satisfies SignalOffer));
  });
  return io;
}
