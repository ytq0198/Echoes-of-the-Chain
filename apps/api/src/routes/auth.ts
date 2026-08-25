import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SessionService } from '../auth/session.js';

interface RouteOptions {
  sessions: SessionService;
}

const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export async function registerAuthRoutes(app: FastifyInstance, options: RouteOptions): Promise<void> {
  app.post('/api/v1/auth/login', async (request, reply) => {
    options.sessions.assertRequestOrigin(request);
    const input = loginSchema.parse(request.body);
    const { claims, token } = options.sessions.login(input.username, input.password);
    reply.header('set-cookie', options.sessions.sessionCookie(token));
    return reply.send(publicSession(claims));
  });

  app.get('/api/v1/auth/session', async (request, reply) => {
    try { return reply.send(publicSession(options.sessions.authenticate(request))); }
    catch { return reply.send({ authenticated: false }); }
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const claims = options.sessions.authenticate(request);
    options.sessions.authorize(request, claims.role, { csrf: true });
    reply.header('set-cookie', options.sessions.clearCookie());
    return reply.send({ authenticated: false });
  });
}

function publicSession(claims: ReturnType<SessionService['authenticate']>) {
  return {
    authenticated: true,
    username: claims.username,
    role: claims.role,
    ...(claims.subjectHash ? { subjectHash: claims.subjectHash } : {}),
    csrfToken: claims.csrfToken,
    expiresAt: new Date(claims.expiresAt * 1_000).toISOString(),
  };
}
