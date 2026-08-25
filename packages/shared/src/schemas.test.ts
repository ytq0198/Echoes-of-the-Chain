import { describe, expect, it } from 'vitest';

import { credentialDraftSchema } from './schemas.js';

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
