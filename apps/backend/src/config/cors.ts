import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

function splitList(s?: string): string[] {
  return (s ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function toRegex(glob: string): RegExp | null {
  if (!glob.includes('*')) return null;
  // escape regex metachars then turn * into .*
  const escaped = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export async function registerCors(fastify: FastifyInstance) {
  const raw = splitList(process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS);
  const exact = raw.filter(x => !x.includes('*'));
  const regexes = raw.map(toRegex).filter((r): r is RegExp => !!r);

  fastify.log.info({ exact, regexes: regexes.map(r => r.source) }, 'CORS allowlist (exact + regex)');

  await fastify.register(cors, {
    credentials: true,
    origin: (origin, cb) => {
      // No Origin header (curl, health checks, same-origin) -> allow
      if (!origin) return cb(null, true);
      if (exact.includes(origin)) return cb(null, true);
      if (regexes.some(r => r.test(origin))) return cb(null, true);
      return cb(null, false);
    },
  });
}