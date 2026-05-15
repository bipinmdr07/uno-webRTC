import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { registerRoomRoutes } from './rooms';
import { attachSignaling } from './signaling';

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.get('/health', async () => ({ ok: true }));
  await registerRoomRoutes(app);
  attachSignaling(app.server);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
}
