import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DemoCredentialLedger } from './demo-ledger.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('DemoCredentialLedger', () => {
  it('supports bounded disclosure without returning unselected grade fields', async () => {
    const ledger = new DemoCredentialLedger();
    const access = { token: 'demo-token', purpose: '奖学金材料核验', verifier: '奖学金评审办公室' };
    const grant = await ledger.createDisclosure({
      grantId: 'grant:2026:demo-test',
      credentialId: 'cred:2026:demo01',
      tokenHash: sha256(access.token),
      purposeHash: sha256(access.purpose),
      verifierHash: sha256(access.verifier),
      selectedFields: ['courseName', 'grade'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: 1,
    });

    expect(grant).not.toHaveProperty('token');
    const privateAccess = Buffer.from(JSON.stringify(access));
    await expect(
      ledger.evaluateDisclosure({ grantId: grant.grantId, privateAccess }),
    ).resolves.toEqual({ courseName: '区块链技术与应用', grade: 'A' });
    await expect(
      ledger.consumeDisclosure({ grantId: grant.grantId, privateAccess }),
    ).resolves.toMatchObject({ usedCount: 1, status: 'CONSUMED' });
    await expect(
      ledger.evaluateDisclosure({ grantId: grant.grantId, privateAccess }),
    ).rejects.toThrow('INVALID_STATE');
  });

  it('rejects a mismatched verifier before revealing fields', async () => {
    const ledger = new DemoCredentialLedger();
    await ledger.createDisclosure({
      grantId: 'grant:2026:demo-wrong-verifier',
      credentialId: 'cred:2026:demo01',
      tokenHash: sha256('demo-token'),
      purposeHash: sha256('课程证明'),
      verifierHash: sha256('指定验证方'),
      selectedFields: ['score'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: 2,
    });

    const privateAccess = Buffer.from(
      JSON.stringify({ token: 'demo-token', purpose: '课程证明', verifier: '其他验证方' }),
    );
    await expect(
      ledger.evaluateDisclosure({ grantId: 'grant:2026:demo-wrong-verifier', privateAccess }),
    ).rejects.toThrow('FORBIDDEN');
  });
});
