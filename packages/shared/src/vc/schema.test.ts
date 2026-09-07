import { describe, expect, it } from 'vitest';

import { credentialFileSchema } from './schema.js';

const hash64 = 'a'.repeat(64);
const proof128 = 'b'.repeat(128);

const validCredential = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://chaingrade.example/contexts/grade-credential/v1',
  ],
  id: 'cred:2026:demo01',
  type: ['VerifiableCredential', 'ChainGradeAcademicCredential'],
  issuer: { id: 'did:example:chaingrade-issuer' },
  validFrom: '2026-09-01T00:00:00.000Z',
  credentialSchema: {
    id: 'https://chaingrade.example/schema/grade-credential/v1',
    type: 'JsonSchema',
    schemaVersion: '1.0',
  },
  credentialSubject: {
    id: `did:example:chaingrade-subject:${hash64}`,
    subjectHash: hash64,
    courseName: '区块链技术与应用',
    score: 92,
    grade: 'A',
  },
  credentialStatus: {
    id: 'urn:chaingrade:credential:cred:2026:demo01#status',
    type: 'ChainGradeFabricStatusV1',
    credentialId: 'cred:2026:demo01',
    statusEndpoint: 'https://chaingrade.example/api/v1/credentials/cred:2026:demo01/verify',
  },
  evidence: {
    type: 'ChainGradeFabricAnchorV1',
    channel: 'chaingrade',
    chaincode: 'grade',
    credentialId: 'cred:2026:demo01',
    issuerMspId: 'Org1MSP',
    schemaVersion: '1.0',
    detailHash: hash64,
    transactionId: 'txid-0001',
    version: 1,
  },
  proof: {
    type: 'ChainGradeEd25519Signature2026',
    created: '2026-09-02T12:00:00.000Z',
    verificationMethod: 'did:example:chaingrade-issuer#key-1',
    proofPurpose: 'assertionMethod',
    canonicalization: 'https://www.rfc-editor.org/rfc/rfc8785',
    proofValue: proof128,
  },
};

describe('credentialFileSchema', () => {
  it('accepts a valid credential file', () => {
    expect(credentialFileSchema.parse(validCredential)).toBeDefined();
  });

  it('rejects a credential missing the proof block', () => {
    const { proof: _proof, ...rest } = validCredential;
    expect(() => credentialFileSchema.parse(rest)).toThrow();
  });

  it('rejects an unknown proofPurpose', () => {
    expect(() =>
      credentialFileSchema.parse({
        ...validCredential,
        proof: { ...validCredential.proof, proofPurpose: 'authentication' },
      }),
    ).toThrow();
  });

  it('rejects a score out of range', () => {
    expect(() =>
      credentialFileSchema.parse({
        ...validCredential,
        credentialSubject: { ...validCredential.credentialSubject, score: 101 },
      }),
    ).toThrow();
  });

  it('rejects a credentialSubject with no exported fields', () => {
    const { id, subjectHash } = validCredential.credentialSubject;
    expect(() =>
      credentialFileSchema.parse({ ...validCredential, credentialSubject: { id, subjectHash } }),
    ).toThrow();
  });

  it('rejects an invalid credentialId', () => {
    expect(() => credentialFileSchema.parse({ ...validCredential, id: 'bad' })).toThrow();
  });

  it('rejects an invalid subjectHash', () => {
    expect(() =>
      credentialFileSchema.parse({
        ...validCredential,
        credentialSubject: { ...validCredential.credentialSubject, subjectHash: 'not-a-hash' },
      }),
    ).toThrow();
  });
});
