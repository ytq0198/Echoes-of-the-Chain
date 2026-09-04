import type { PublicCredentialRecord } from '@chaingrade/shared';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { CredentialLedger } from '../ledger/types.js';
import { exportCredential } from '../vc/exporter.js';
import { generateEd25519KeyPair, loadIssuerKeys } from '../vc/issuer-keys.js';

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

function makeLedger(record: PublicCredentialRecord) {
  return {
    read: vi.fn(async () => record),
    close: vi.fn(),
  } as unknown as CredentialLedger;
}

function postVerify(app: ReturnType<typeof buildApp>, raw: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/verify',
    headers: { 'content-type': 'application/vc+json' },
    payload: raw,
  });
}

describe('POST /api/v1/verify', () => {
  it('returns a valid three-segment result for an authentic credential', async () => {
    const keys = makeKeys();
    const record = activeRecord();
    const ledger = makeLedger(record);
    const app = buildApp({ ledger, issuerKeys: keys });
    const credential = exportCredential(record, privateDetails, ['courseName', 'score', 'grade'], keys);

    const response = await postVerify(app, JSON.stringify(credential));

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const result = response.json();
    expect(result.conclusion).toBe('valid');
    expect(result.signature.valid).toBe(true);
    expect(result.chainStatus.status).toBe('ACTIVE');
    expect(result.anchor.detailHashMatch).toBe(true);
    expect(result.anchor.subjectHashMatch).toBe(true);
    await app.close();
  });

  it('reports an invalid conclusion for a tampered credential', async () => {
    const keys = makeKeys();
    const record = activeRecord();
    const ledger = makeLedger(record);
    const app = buildApp({ ledger, issuerKeys: keys });
    const credential = exportCredential(record, privateDetails, ['courseName', 'score', 'grade'], keys);
    const tampered = {
      ...credential,
      credentialSubject: { ...credential.credentialSubject, score: 60 },
    };

    const response = await postVerify(app, JSON.stringify(tampered));

    expect(response.statusCode).toBe(200);
    expect(response.json().conclusion).toBe('invalid');
    expect(response.json().signature.valid).toBe(false);
    await app.close();
  });

  it('rejects a body with duplicate keys', async () => {
    const keys = makeKeys();
    const app = buildApp({ ledger: makeLedger(activeRecord()), issuerKeys: keys });

    const response = await postVerify(app, '{"a":1,"a":2}');

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_JSON');
    await app.close();
  });

  it('rejects a non-JSON body', async () => {
    const keys = makeKeys();
    const app = buildApp({ ledger: makeLedger(activeRecord()), issuerKeys: keys });

    const response = await postVerify(app, 'not json');

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_JSON');
    await app.close();
  });

  it('rejects a structurally invalid credential missing the proof block', async () => {
    const keys = makeKeys();
    const app = buildApp({ ledger: makeLedger(activeRecord()), issuerKeys: keys });
    const credential = exportCredential(activeRecord(), privateDetails, ['courseName'], keys);
    const { proof: _proof, ...rest } = credential;

    const response = await postVerify(app, JSON.stringify(rest));

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('rejects an oversized body', async () => {
    const keys = makeKeys();
    const app = buildApp({ ledger: makeLedger(activeRecord()), issuerKeys: keys });

    const response = await postVerify(app, 'x'.repeat(70 * 1024));

    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('FILE_TOO_LARGE');
    await app.close();
  });

  it('returns 503 when issuer keys are not configured', async () => {
    const app = buildApp({ ledger: makeLedger(activeRecord()) });
    const keys = makeKeys();
    const credential = exportCredential(activeRecord(), privateDetails, ['courseName'], keys);

    const response = await postVerify(app, JSON.stringify(credential));

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('VC_KEYS_UNAVAILABLE');
    await app.close();
  });

  it('maps a missing credential to 404 via the central error handler', async () => {
    const keys = makeKeys();
    const ledger = {
      read: vi.fn(async () => {
        throw new Error('NOT_FOUND: credential does not exist');
      }),
      close: vi.fn(),
    } as unknown as CredentialLedger;
    const app = buildApp({ ledger, issuerKeys: keys });
    const credential = exportCredential(activeRecord(), privateDetails, ['courseName'], keys);

    const response = await postVerify(app, JSON.stringify(credential));

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');
    await app.close();
  });
});
