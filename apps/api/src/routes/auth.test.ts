import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { SessionService, type SessionConfig } from '../auth/session.js';
import type { CredentialLedger } from '../ledger/types.js';

const origin = 'http://127.0.0.1:5173';
const config: SessionConfig = {
  secret: '0123456789abcdef0123456789abcdef',
  accounts: [
    { username: 'issuer', password: 'issuer-password-123', role: 'issuer' },
    { username: 'student', password: 'student-password-123', role: 'student', subjectHash: 'a'.repeat(64) },
  ],
  allowedOrigins: [origin],
  ttlSeconds: 3_600,
  secureCookie: false,
  allowNonBrowserClients: false,
};

function ledger(): CredentialLedger {
  return {
    createDraft: vi.fn(), createAmendment: vi.fn(), approve: vi.fn(), read: vi.fn(), readPrivateDetails: vi.fn(async () => ({ score: 92 })), verify: vi.fn(),
    submitAppeal: vi.fn(), reviewAppeal: vi.fn(), readAppeal: vi.fn(), close: vi.fn(),
  };
}

describe('authentication routes', () => {
  it('uses an HttpOnly strict cookie and supports authenticated session lookup/logout', async () => {
    const app = buildApp({ sessions: new SessionService(config) });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: 'issuer', password: 'issuer-password-123' } });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Strict');
    const cookie = login.headers['set-cookie']?.split(';')[0] ?? '';
    const session = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } });
    expect(session.json()).toMatchObject({ authenticated: true, role: 'issuer' });
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin, 'x-csrf-token': login.json().csrfToken } });
    expect(logout.statusCode).toBe(200);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    await app.close();
  });

  it('rejects wrong credentials, missing CSRF and a mismatched role', async () => {
    const sessions = new SessionService(config);
    const app = buildApp({ sessions, ledger: ledger() });
    const denied = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: 'issuer', password: 'wrong-password' } });
    expect(denied.statusCode).toBe(401);

    const issuerLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: 'issuer', password: 'issuer-password-123' } });
    const issuerCookie = issuerLogin.headers['set-cookie']?.split(';')[0] ?? '';
    const issuerPrivateRead = await app.inject({ method: 'GET', url: '/api/v1/credentials/cred:2026:api01/private-details', headers: { cookie: issuerCookie } });
    expect(issuerPrivateRead.json()).toMatchObject({ code: 'ROLE_FORBIDDEN' });
    const missingCsrf = await app.inject({ method: 'POST', url: '/api/v1/credentials/drafts', headers: { cookie: issuerCookie, origin }, payload: {} });
    expect(missingCsrf.json()).toMatchObject({ code: 'CSRF_INVALID' });

    const studentLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: 'student', password: 'student-password-123' } });
    const studentCookie = studentLogin.headers['set-cookie']?.split(';')[0] ?? '';
    const studentPrivateRead = await app.inject({ method: 'GET', url: '/api/v1/credentials/cred:2026:api01/private-details', headers: { cookie: studentCookie } });
    expect(studentPrivateRead.json()).toMatchObject({ score: 92 });
    const wrongRole = await app.inject({ method: 'POST', url: '/api/v1/credentials/drafts', headers: { cookie: studentCookie, origin, 'x-csrf-token': studentLogin.json().csrfToken }, payload: {} });
    expect(wrongRole.json()).toMatchObject({ code: 'ROLE_FORBIDDEN' });
    await app.close();
  });
});
