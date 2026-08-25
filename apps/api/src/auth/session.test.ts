import { describe, expect, it } from 'vitest';

import { SessionService, type SessionConfig } from './session.js';

const config: SessionConfig = {
  secret: '0123456789abcdef0123456789abcdef',
  accounts: [{ username: 'student', password: 'safe-password-123', role: 'student', subjectHash: 'a'.repeat(64) }],
  allowedOrigins: ['http://127.0.0.1:5173'],
  ttlSeconds: 3_600,
  secureCookie: false,
  allowNonBrowserClients: false,
};

describe('SessionService', () => {
  it('signs, verifies and expires a role-bound session', () => {
    const sessions = new SessionService(config);
    const issued = sessions.login('student', 'safe-password-123', 1_000_000);
    const request = { headers: { cookie: `${sessions.cookieName}=${issued.token}` } } as never;
    expect(sessions.authenticate(request, 1_001_000)).toMatchObject({ role: 'student', subjectHash: 'a'.repeat(64) });
    expect(() => sessions.authenticate(request, 5_000_000)).toThrow('AUTHENTICATION_REQUIRED');
  });

  it('rejects a modified token and cross-site origin', () => {
    const sessions = new SessionService(config);
    const issued = sessions.login('student', 'safe-password-123');
    const request = { headers: { cookie: `${sessions.cookieName}=${issued.token}x` } } as never;
    expect(() => sessions.authenticate(request)).toThrow('AUTHENTICATION_REQUIRED');
    expect(() => sessions.assertRequestOrigin({ headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' } } as never)).toThrow('CSRF_INVALID');
  });
});
