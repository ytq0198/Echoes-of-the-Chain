import { credentialFileSchema } from '@chaingrade/shared';
import type { PublicCredentialRecord } from '@chaingrade/shared';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { SessionService, type SessionConfig } from '../auth/session.js';
import type { CredentialLedger } from '../ledger/types.js';
import { generateEd25519KeyPair, loadIssuerKeys } from '../vc/issuer-keys.js';
import { verifyDocument } from '../vc/signer.js';

const hash = 'a'.repeat(64);

function activeRecord(overrides: Partial<PublicCredentialRecord> = {}): PublicCredentialRecord {
  return {
    docType: 'gradeCredential',
    credentialId: 'cred:2026:api01',
    subjectHash: hash,
    courseHash: hash,
    detailHash: hash,
    issuerMspId: 'Org1MSP',
    schemaVersion: '1.0',
    status: 'ACTIVE',
    version: 1,
    submittedByIdentityHash: hash,
    reviewedByIdentityHash: hash,
    issuedAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:01:00.000Z',
    transactionId: 'tx-api-01',
    ...overrides,
  };
}

const privateDetails = {
  courseName: '区块链技术与应用',
  score: 92,
  grade: 'A',
  salt: 'CHAIN_GRADE_DEMO_2026',
};

function makeKeys() {
  const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
  return loadIssuerKeys({ VC_ISSUER_PRIVATE_KEY: privateKeyPem, VC_ISSUER_PUBLIC_KEY: publicKeyPem });
}

function makeLedger(record: PublicCredentialRecord, details: Record<string, unknown> = privateDetails) {
  return {
    read: vi.fn(async () => record),
    readPrivateDetails: vi.fn(async () => details),
    close: vi.fn(),
  } as unknown as CredentialLedger;
}

describe('POST /api/v1/credentials/:credentialId/export', () => {
  it('exports a signed, schema-valid credential for an ACTIVE record', async () => {
    const keys = makeKeys();
    const ledger = makeLedger(activeRecord());
    const app = buildApp({ ledger, issuerKeys: keys });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      payload: { selectedFields: ['courseName', 'score', 'grade'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(ledger.read).toHaveBeenCalledWith('cred:2026:api01');
    expect(ledger.readPrivateDetails).toHaveBeenCalledWith('cred:2026:api01');

    const credential = response.json();
    expect(credentialFileSchema.parse(credential)).toBeDefined();
    expect(credential.credentialSubject.score).toBe(92);
    expect(verifyDocument(credential, keys.publicKey)).toBe(true);

    await app.close();
  });

  it('rejects export for a non-ACTIVE credential', async () => {
    const keys = makeKeys();
    const ledger = makeLedger(activeRecord({ status: 'REVOKED' }));
    const app = buildApp({ ledger, issuerKeys: keys });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      payload: { selectedFields: ['score'] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('INVALID_STATE');
    await app.close();
  });

  it('rejects an empty selectedFields', async () => {
    const keys = makeKeys();
    const ledger = makeLedger(activeRecord());
    const app = buildApp({ ledger, issuerKeys: keys });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      payload: { selectedFields: [] },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when issuer keys are not configured', async () => {
    const ledger = makeLedger(activeRecord());
    const app = buildApp({ ledger });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      payload: { selectedFields: ['score'] },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('VC_KEYS_UNAVAILABLE');
    await app.close();
  });
});

const origin = 'http://127.0.0.1:5173';
const sessionConfig: SessionConfig = {
  secret: '0123456789abcdef0123456789abcdef',
  accounts: [
    { username: 'issuer', password: 'issuer-password-123', role: 'issuer' },
    { username: 'student', password: 'student-password-123', role: 'student', subjectHash: hash },
  ],
  allowedOrigins: [origin],
  ttlSeconds: 3_600,
  secureCookie: false,
  allowNonBrowserClients: false,
};

describe('POST /api/v1/credentials/:credentialId/export (authentication)', () => {
  it('enforces authentication, role and CSRF protection', async () => {
    const keys = makeKeys();
    const ledger = makeLedger(activeRecord());
    const sessions = new SessionService(sessionConfig);
    const app = buildApp({ ledger, issuerKeys: keys, sessions });

    const unauth = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      headers: { origin },
      payload: { selectedFields: ['score'] },
    });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.json().code).toBe('AUTHENTICATION_REQUIRED');

    const issuerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { username: 'issuer', password: 'issuer-password-123' },
    });
    const issuerCookie = issuerLogin.headers['set-cookie']?.split(';')[0] ?? '';
    const wrongRole = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      headers: { cookie: issuerCookie, origin, 'x-csrf-token': issuerLogin.json().csrfToken },
      payload: { selectedFields: ['score'] },
    });
    expect(wrongRole.statusCode).toBe(403);
    expect(wrongRole.json().code).toBe('ROLE_FORBIDDEN');

    const studentLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { username: 'student', password: 'student-password-123' },
    });
    const studentCookie = studentLogin.headers['set-cookie']?.split(';')[0] ?? '';

    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      headers: { cookie: studentCookie, origin },
      payload: { selectedFields: ['score'] },
    });
    expect(missingCsrf.statusCode).toBe(403);
    expect(missingCsrf.json().code).toBe('CSRF_INVALID');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/export',
      headers: { cookie: studentCookie, origin, 'x-csrf-token': studentLogin.json().csrfToken },
      payload: { selectedFields: ['score'] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');

    await app.close();
  });
});
