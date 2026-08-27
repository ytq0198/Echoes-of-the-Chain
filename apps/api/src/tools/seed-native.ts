import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../lib/canonical-json.js';
import { loadFabricConfig } from '../ledger/fabric-config.js';
import { FabricCredentialLedger } from '../ledger/fabric-ledger.js';

const credentialId = 'cred:demo:blockchain-2026';
const appealId = 'appeal:demo:blockchain-2026';
const subjectHash = hashText('chaingrade-demo-student-v1');
const courseHash = hashText('chaingrade-course-blockchain-2026');
const privateDetails = Buffer.from(
  canonicalJson({
    courseName: '区块链技术与应用',
    score: 94,
    grade: 'A',
    salt: 'CHAINGRADE_DEMO_SEED_2026',
  }),
);
const detailHash = createHash('sha256').update(privateDetails).digest('hex');
const appealDetails = Buffer.from(
  canonicalJson({
    reason: '课程实验成绩记录存在疑问，请复核原始评分明细。',
    salt: 'CHAINGRADE_APPEAL_SEED_2026',
  }),
);
const reasonHash = createHash('sha256').update(appealDetails).digest('hex');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ledger = new FabricCredentialLedger(
  loadFabricConfig({ ...process.env, CHAINGRADE_PROJECT_ROOT: projectRoot }),
);

try {
  let credential = await readOrUndefined(() => ledger.read(credentialId));
  let credentialCreated = false;
  let credentialApproved = false;

  if (!credential) {
    credential = await ledger.createDraft({
      credentialId,
      subjectHash,
      courseHash,
      detailHash,
      schemaVersion: '1.0',
      privateDetails,
    });
    credentialCreated = true;
  }
  assertCredentialCommitments(credential);
  if (credential.status === 'PENDING_REVIEW') {
    credential = await ledger.approve(credentialId);
    credentialApproved = true;
  }
  if (credential.status !== 'ACTIVE') {
    throw new Error(`Seed credential has unexpected status ${credential.status}`);
  }

  let appeal = await readOrUndefined(() => ledger.readAppeal(appealId));
  let appealCreated = false;
  if (!appeal) {
    appeal = await ledger.submitAppeal({
      appealId,
      credentialId,
      reasonHash,
      privateDetails: appealDetails,
    });
    appealCreated = true;
  }
  if (appeal.credentialId !== credentialId || appeal.reasonHash !== reasonHash) {
    throw new Error('Seed appeal exists with different commitments');
  }
  if (appeal.status !== 'OPEN') {
    throw new Error(`Seed appeal has unexpected status ${appeal.status}`);
  }

  const verification = await ledger.verify(credentialId, detailHash);
  const disclosed = await ledger.readPrivateDetails(credentialId);
  if (!verification.authentic || !verification.valid || disclosed.score !== 94) {
    throw new Error('Seed state verification failed');
  }

  console.log(
    JSON.stringify({
      credentialId,
      credentialStatus: credential.status,
      credentialCreated,
      credentialApproved,
      appealId,
      appealStatus: appeal.status,
      appealCreated,
      authentic: verification.authentic,
      valid: verification.valid,
      privateDetailsReadable: true,
    }),
  );
} finally {
  ledger.close();
}

async function readOrUndefined<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (String(error).includes('NOT_FOUND')) return undefined;
    throw error;
  }
}

function assertCredentialCommitments(credential: {
  subjectHash: string;
  courseHash: string;
  detailHash: string;
  schemaVersion: string;
}): void {
  if (
    credential.subjectHash !== subjectHash ||
    credential.courseHash !== courseHash ||
    credential.detailHash !== detailHash ||
    credential.schemaVersion !== '1.0'
  ) {
    throw new Error('Seed credential exists with different commitments');
  }
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
