import { describe, expect, it } from 'vitest';

import {
  consumeDisclosureRequestSchema,
  createDisclosureRequestSchema,
  credentialDraftSchema,
} from './schemas.js';

const hash = 'a'.repeat(64);

describe('credentialDraftSchema', () => {
  it('accepts a minimal privacy-preserving public draft', () => {
    expect(
      credentialDraftSchema.parse({
        credentialId: 'cred:2026:0001',
        subjectHash: hash,
        courseHash: hash,
        detailHash: hash,
        schemaVersion: '1.0',
      }),
    ).toBeDefined();
  });

  it('rejects a plaintext student number in place of a hash', () => {
    expect(() =>
      credentialDraftSchema.parse({
        credentialId: 'cred:2026:0001',
        subjectHash: 'student-123',
        courseHash: hash,
        detailHash: hash,
        schemaVersion: '1.0',
      }),
    ).toThrow();
  });
});

describe('disclosure request schemas', () => {
  it('accepts a bounded field disclosure grant', () => {
    expect(createDisclosureRequestSchema.parse({
      grantId: 'grant:2026:0001',
      selectedFields: ['courseName', 'grade'],
      purpose: '研究生申请材料核验',
      verifier: '目标院校招生办公室',
      expiresAt: '2026-08-28T12:00:00.000Z',
      maxUses: 2,
    })).toMatchObject({ selectedFields: ['courseName', 'grade'], maxUses: 2 });
  });

  it('rejects secret fields, duplicate fields and weak consume inputs', () => {
    expect(() => createDisclosureRequestSchema.parse({
      grantId: 'grant:2026:0001',
      selectedFields: ['salt'],
      purpose: '研究生申请材料核验',
      verifier: '目标院校招生办公室',
      expiresAt: '2026-08-28T12:00:00.000Z',
      maxUses: 1,
    })).toThrow();
    expect(() => createDisclosureRequestSchema.parse({
      grantId: 'grant:2026:0001',
      selectedFields: ['grade', 'grade'],
      purpose: '研究生申请材料核验',
      verifier: '目标院校招生办公室',
      expiresAt: '2026-08-28T12:00:00.000Z',
      maxUses: 1,
    })).toThrow();
    expect(() => consumeDisclosureRequestSchema.parse({
      token: 'short', purpose: '研究生申请材料核验', verifier: '目标院校招生办公室',
    })).toThrow();
  });
});
