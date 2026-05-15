export const config = {
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  inviteTtlSeconds: Number(process.env.INVITE_TTL_SECONDS ?? 86400),
};
