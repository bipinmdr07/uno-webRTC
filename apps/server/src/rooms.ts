import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Player, Room } from '@uno/shared-types';
import { defaultRuleSet, displayPlayerAvatar } from '@uno/shared-types';
import { config } from './config';

const rooms = new Map<string, Room>();
const createRoomSchema = z.object({ maxPlayers: z.number().min(1).max(16).default(16), public: z.boolean().default(false) });

export async function registerRoomRoutes(app: FastifyInstance): Promise<void> {
  app.post('/rooms', async (request, reply) => {
    const body = createRoomSchema.parse(request.body ?? {});
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const inviteToken = jwt.sign({ roomId: id, public: body.public }, config.jwtSecret, { expiresIn: config.inviteTtlSeconds });
    const room: Room = { id, inviteToken, players: [], rules: { ...defaultRuleSet, maxPlayers: body.maxPlayers }, status: 'lobby', createdAt: new Date().toISOString() };
    rooms.set(id, room);
    return reply.send({ room, inviteUrl: `/room/${id}?token=${inviteToken}` });
  });

  app.get('/rooms/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = rooms.get(id);
    if (!room) return reply.code(404).send({ message: 'room not found' });
    return room;
  });

  app.post('/rooms/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { token, player } = request.body as { token?: string; player?: Player };
    try { jwt.verify(token ?? '', config.jwtSecret); } catch { return reply.code(401).send({ message: 'invalid invite token' }); }
    const room = rooms.get(id);
    if (!room) return reply.code(404).send({ message: 'room not found' });
    if (room.status !== 'lobby') {
      if (player && room.players.some((p) => p.id === player.id)) return room;
      return reply.code(409).send({ message: 'match already started' });
    }
    if (room.players.length >= room.rules.maxPlayers) return reply.code(409).send({ message: 'room full' });
    if (player && !room.players.some((p) => p.id === player.id)) {
      room.players.push({ ...player, avatar: displayPlayerAvatar(player.avatar) });
    }
    return room;
  });

  const startBody = z.object({ token: z.string(), playerId: z.string() });
  app.post('/rooms/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = startBody.parse(request.body ?? {});
    try { jwt.verify(body.token, config.jwtSecret); } catch { return reply.code(401).send({ message: 'invalid invite token' }); }
    const room = rooms.get(id);
    if (!room) return reply.code(404).send({ message: 'room not found' });
    if (room.status !== 'lobby') return reply.code(409).send({ message: 'already started' });
    if (room.players[0]?.id !== body.playerId) return reply.code(403).send({ message: 'only host can start' });
    if (room.players.length < 2) return reply.code(400).send({ message: 'need at least two players to start' });
    room.status = 'playing';
    return room;
  });

  app.get('/me/stats', async () => ({ wins: 0, losses: 0, xp: 0, cosmetics: [], friends: [] }));
}

export function getRoom(id: string): Room | undefined { return rooms.get(id); }
