import { createHash, randomUUID } from 'node:crypto';

import type {
  DisclosureField,
  LedgerPage,
  PublicAppealRecord,
  PublicCredentialRecord,
  PublicDisclosureGrant,
} from '@chaingrade/shared';

import type {
  ConsumeDisclosureCommand,
  CreateAppealCommand,
  CreateCredentialCommand,
  CreateDisclosureCommand,
  CredentialDecisionCommand,
  CredentialLedger,
  CredentialVerification,
  ReviewAppealCommand,
} from './types.js';

const DEMO_SUBJECT = createHash('sha256').update('demo-student').digest('hex');
const DEMO_ACTOR = createHash('sha256').update('demo-identity').digest('hex');

function transactionId(): string {
  return `demo-${randomUUID()}`;
}

function page<T>(items: T[]): LedgerPage<T> {
  return { items, bookmark: '', fetchedRecordsCount: items.length };
}

function decodePrivateDetails(value: Uint8Array): Record<string, unknown> {
  return JSON.parse(Buffer.from(value).toString('utf8')) as Record<string, unknown>;
}

/**
 * Explicitly labelled, process-local ledger used for offline demos and UI QA.
 * It is never selected unless DEMO_ENABLED=true and must not be presented as Fabric evidence.
 */
export class DemoCredentialLedger implements CredentialLedger {
  private readonly credentials = new Map<string, PublicCredentialRecord>();
  private readonly details = new Map<string, Record<string, unknown>>();
  private readonly appeals = new Map<string, PublicAppealRecord>();
  private readonly disclosures = new Map<string, PublicDisclosureGrant>();

  constructor() {
    const now = new Date().toISOString();
    const details = {
      courseName: '区块链技术与应用',
      score: 92,
      grade: 'A',
      salt: 'DEMO_ONLY_PRIVATE_SALT',
    };
    const credential: PublicCredentialRecord = {
      docType: 'gradeCredential',
      credentialId: 'cred:2026:demo01',
      subjectHash: DEMO_SUBJECT,
      courseHash: createHash('sha256').update('区块链技术与应用').digest('hex'),
      detailHash: createHash('sha256').update(JSON.stringify(details)).digest('hex'),
      issuerMspId: 'Org1MSP',
      schemaVersion: '1.0',
      status: 'ACTIVE',
      version: 1,
      submittedByIdentityHash: DEMO_ACTOR,
      reviewedByIdentityHash: DEMO_ACTOR,
      issuedAt: now,
      updatedAt: now,
      transactionId: transactionId(),
    };
    this.credentials.set(credential.credentialId, credential);
    this.details.set(credential.credentialId, details);
  }

  async createDraft(command: CreateCredentialCommand): Promise<PublicCredentialRecord> {
    if (this.credentials.has(command.credentialId))
      throw new Error('ALREADY_EXISTS: Credential already exists');
    const now = new Date().toISOString();
    const record: PublicCredentialRecord = {
      docType: 'gradeCredential',
      credentialId: command.credentialId,
      subjectHash: command.subjectHash,
      courseHash: command.courseHash,
      detailHash: command.detailHash,
      issuerMspId: 'Org1MSP',
      schemaVersion: command.schemaVersion,
      status: 'PENDING_REVIEW',
      version: 1,
      submittedByIdentityHash: DEMO_ACTOR,
      issuedAt: now,
      updatedAt: now,
      transactionId: transactionId(),
    };
    this.credentials.set(record.credentialId, record);
    this.details.set(record.credentialId, decodePrivateDetails(command.privateDetails));
    return record;
  }

  async createBatchDrafts(commands: CreateCredentialCommand[]): Promise<PublicCredentialRecord[]> {
    if (commands.length < 1 || commands.length > 50)
      throw new Error('INVALID_ARGUMENT: Batch size must be 1-50');
    const identifiers = commands.map((command) => command.credentialId);
    if (new Set(identifiers).size !== identifiers.length)
      throw new Error('INVALID_ARGUMENT: Duplicate credential id');
    if (identifiers.some((identifier) => this.credentials.has(identifier))) {
      throw new Error('ALREADY_EXISTS: Credential already exists');
    }
    const now = new Date().toISOString();
    const batchTransactionId = transactionId();
    const records = commands.map((command): PublicCredentialRecord => ({
      docType: 'gradeCredential',
      credentialId: command.credentialId,
      subjectHash: command.subjectHash,
      courseHash: command.courseHash,
      detailHash: command.detailHash,
      issuerMspId: 'Org1MSP',
      schemaVersion: command.schemaVersion,
      status: 'PENDING_REVIEW',
      version: 1,
      submittedByIdentityHash: DEMO_ACTOR,
      issuedAt: now,
      updatedAt: now,
      transactionId: batchTransactionId,
    }));
    records.forEach((record, index) => {
      this.credentials.set(record.credentialId, record);
      this.details.set(record.credentialId, decodePrivateDetails(commands[index]!.privateDetails));
    });
    return records;
  }

  async createAmendment(
    previousCredentialId: string,
    command: CreateCredentialCommand,
  ): Promise<PublicCredentialRecord> {
    const previous = await this.read(previousCredentialId);
    if (previous.status !== 'ACTIVE')
      throw new Error('INVALID_STATE: Only active credentials can be amended');
    const record = await this.createDraft(command);
    const amended = {
      ...record,
      subjectHash: previous.subjectHash,
      courseHash: previous.courseHash,
      version: previous.version + 1,
      previousCredentialId,
    };
    this.credentials.set(amended.credentialId, amended);
    return amended;
  }

  async approve(credentialId: string): Promise<PublicCredentialRecord> {
    const record = await this.read(credentialId);
    if (record.status !== 'PENDING_REVIEW')
      throw new Error('INVALID_STATE: Credential is not pending review');
    const now = new Date().toISOString();
    const active = {
      ...record,
      status: 'ACTIVE' as const,
      reviewedByIdentityHash: DEMO_ACTOR,
      updatedAt: now,
      transactionId: transactionId(),
    };
    this.credentials.set(credentialId, active);
    if (record.previousCredentialId) {
      const previous = await this.read(record.previousCredentialId);
      this.credentials.set(previous.credentialId, {
        ...previous,
        status: 'SUPERSEDED',
        updatedAt: now,
        transactionId: transactionId(),
      });
    }
    return active;
  }

  async reject(command: CredentialDecisionCommand): Promise<PublicCredentialRecord> {
    return this.decideCredential(command, 'REJECTED');
  }

  async revoke(command: CredentialDecisionCommand): Promise<PublicCredentialRecord> {
    return this.decideCredential(command, 'REVOKED');
  }

  private async decideCredential(
    command: CredentialDecisionCommand,
    status: 'REJECTED' | 'REVOKED',
  ) {
    const record = await this.read(command.credentialId);
    const updated = {
      ...record,
      status,
      reasonHash: command.reasonHash,
      reviewedByIdentityHash: DEMO_ACTOR,
      updatedAt: new Date().toISOString(),
      transactionId: transactionId(),
    };
    this.credentials.set(record.credentialId, updated);
    return updated;
  }

  async read(credentialId: string): Promise<PublicCredentialRecord> {
    const record = this.credentials.get(credentialId);
    if (!record) throw new Error('NOT_FOUND: Credential not found');
    return record;
  }

  async listIssued(
    status: PublicCredentialRecord['status'],
  ): Promise<LedgerPage<PublicCredentialRecord>> {
    return page([...this.credentials.values()].filter((record) => record.status === status));
  }

  async listForReview(
    status: PublicCredentialRecord['status'],
  ): Promise<LedgerPage<PublicCredentialRecord>> {
    return this.listIssued(status);
  }

  async listMine(): Promise<LedgerPage<PublicCredentialRecord>> {
    return page(
      [...this.credentials.values()].filter((record) =>
        ['ACTIVE', 'SUPERSEDED', 'REVOKED'].includes(record.status),
      ),
    );
  }

  async readPrivateDetails(credentialId: string): Promise<Record<string, unknown>> {
    await this.read(credentialId);
    const details = this.details.get(credentialId);
    if (!details) throw new Error('NOT_FOUND: Private details not found');
    return details;
  }

  async verify(credentialId: string, expectedDetailHash?: string): Promise<CredentialVerification> {
    const record = await this.read(credentialId);
    const authentic = !expectedDetailHash || expectedDetailHash === record.detailHash;
    return {
      credentialId,
      authentic,
      valid: authentic && record.status === 'ACTIVE',
      status: record.status,
      issuerMspId: record.issuerMspId,
      version: record.version,
      updatedAt: record.updatedAt,
      transactionId: record.transactionId,
    };
  }

  async createDisclosure(command: CreateDisclosureCommand): Promise<PublicDisclosureGrant> {
    const credential = await this.read(command.credentialId);
    if (credential.status !== 'ACTIVE') throw new Error('INVALID_STATE: Credential is not active');
    if (this.disclosures.has(command.grantId))
      throw new Error('ALREADY_EXISTS: Disclosure grant already exists');
    const now = new Date().toISOString();
    const grant: PublicDisclosureGrant = {
      docType: 'gradeDisclosureGrant',
      grantId: command.grantId,
      credentialId: command.credentialId,
      subjectHash: credential.subjectHash,
      issuerMspId: credential.issuerMspId,
      tokenHash: command.tokenHash,
      purposeHash: command.purposeHash,
      verifierHash: command.verifierHash,
      selectedFields: command.selectedFields,
      expiresAt: command.expiresAt,
      maxUses: command.maxUses,
      usedCount: 0,
      status: 'ACTIVE',
      createdByIdentityHash: DEMO_ACTOR,
      createdAt: now,
      updatedAt: now,
      transactionId: transactionId(),
    };
    this.disclosures.set(grant.grantId, grant);
    return grant;
  }

  private validateDisclosure(command: ConsumeDisclosureCommand): PublicDisclosureGrant {
    const grant = this.disclosures.get(command.grantId);
    if (!grant) throw new Error('NOT_FOUND: Disclosure grant not found');
    if (grant.status !== 'ACTIVE') throw new Error('INVALID_STATE: Disclosure grant is not active');
    if (Date.parse(grant.expiresAt) <= Date.now())
      throw new Error('INVALID_STATE: Disclosure grant has expired');
    const access = decodePrivateDetails(command.privateAccess);
    const hash = (value: unknown) => createHash('sha256').update(String(value)).digest('hex');
    if (
      hash(access.token) !== grant.tokenHash ||
      hash(access.purpose) !== grant.purposeHash ||
      hash(access.verifier) !== grant.verifierHash
    ) {
      throw new Error('FORBIDDEN: Disclosure access does not match the grant');
    }
    return grant;
  }

  async evaluateDisclosure(
    command: ConsumeDisclosureCommand,
  ): Promise<Partial<Record<DisclosureField, unknown>>> {
    const grant = this.validateDisclosure(command);
    const details = await this.readPrivateDetails(grant.credentialId);
    return Object.fromEntries(grant.selectedFields.map((field) => [field, details[field]]));
  }

  async consumeDisclosure(command: ConsumeDisclosureCommand): Promise<PublicDisclosureGrant> {
    const grant = this.validateDisclosure(command);
    const usedCount = grant.usedCount + 1;
    const updated = {
      ...grant,
      usedCount,
      status: usedCount >= grant.maxUses ? ('CONSUMED' as const) : ('ACTIVE' as const),
      lastConsumedByIdentityHash: DEMO_ACTOR,
      updatedAt: new Date().toISOString(),
      transactionId: transactionId(),
    };
    this.disclosures.set(grant.grantId, updated);
    return updated;
  }

  async revokeDisclosure(grantId: string): Promise<PublicDisclosureGrant> {
    const grant = this.disclosures.get(grantId);
    if (!grant) throw new Error('NOT_FOUND: Disclosure grant not found');
    const updated = {
      ...grant,
      status: 'REVOKED' as const,
      updatedAt: new Date().toISOString(),
      transactionId: transactionId(),
    };
    this.disclosures.set(grantId, updated);
    return updated;
  }

  async listMyDisclosures(): Promise<LedgerPage<PublicDisclosureGrant>> {
    return page([...this.disclosures.values()]);
  }

  async submitAppeal(command: CreateAppealCommand): Promise<PublicAppealRecord> {
    const credential = await this.read(command.credentialId);
    const now = new Date().toISOString();
    const appeal: PublicAppealRecord = {
      docType: 'gradeAppeal',
      appealId: command.appealId,
      credentialId: command.credentialId,
      subjectHash: credential.subjectHash,
      issuerMspId: credential.issuerMspId,
      reasonHash: command.reasonHash,
      status: 'OPEN',
      submittedAt: now,
      updatedAt: now,
      submittedByIdentityHash: DEMO_ACTOR,
      transactionId: transactionId(),
    };
    this.appeals.set(appeal.appealId, appeal);
    return appeal;
  }

  async reviewAppeal(command: ReviewAppealCommand): Promise<PublicAppealRecord> {
    const appeal = await this.readAppeal(command.appealId);
    const updated = {
      ...appeal,
      status:
        command.decision === 'ACCEPTED'
          ? ('RESOLVED_ACCEPTED' as const)
          : ('RESOLVED_REJECTED' as const),
      resolutionHash: command.resolutionHash,
      reviewedByIdentityHash: DEMO_ACTOR,
      updatedAt: new Date().toISOString(),
      transactionId: transactionId(),
    };
    this.appeals.set(appeal.appealId, updated);
    return updated;
  }

  async readAppeal(appealId: string): Promise<PublicAppealRecord> {
    const appeal = this.appeals.get(appealId);
    if (!appeal) throw new Error('NOT_FOUND: Appeal not found');
    return appeal;
  }

  async listAppealsForReview(
    status: PublicAppealRecord['status'],
  ): Promise<LedgerPage<PublicAppealRecord>> {
    return page([...this.appeals.values()].filter((appeal) => appeal.status === status));
  }

  async listMyAppeals(): Promise<LedgerPage<PublicAppealRecord>> {
    return page([...this.appeals.values()]);
  }

  close(): void {}
}
