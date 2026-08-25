import { describe, expect, it } from 'vitest';

import { loadSessionConfig, SessionService, type SessionConfig } from './session.js';

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

  it('fails closed when enabled authentication configuration is incomplete', () => {
    expect(() => loadSessionConfig({ AUTH_ENABLED: 'true' })).toThrow('AUTH_SESSION_SECRET');
    expect(() => loadSessionConfig({
      AUTH_ENABLED: 'true', AUTH_SESSION_SECRET: 'x'.repeat(32),
      AUTH_ISSUER_PASSWORD: 'issuer-password', AUTH_REVIEWER_PASSWORD: 'reviewer-password',
      AUTH_STUDENT_PASSWORD: 'student-password', AUTH_STUDENT_SUBJECT_HASH: 'a'.repeat(64),
    })).toThrow('AUTH_ALLOWED_ORIGINS');
  });
});
