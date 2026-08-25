import { createHash } from 'node:crypto';

import { Context, Contract } from 'fabric-contract-api';

import { AcademicRecordError } from './lib/errors';
import { assertIdentifier, assertSha256, parseJsonObject } from './lib/validation';
import type { AppealDecision, AppealRecord, CredentialDraftInput, CredentialRecord } from './model';

export class GradeContract extends Contract {
  public constructor() {
    super('org.chaingrade.GradeContract');
  }

  public async CredentialExists(ctx: Context, credentialId: string): Promise<boolean> {
    assertIdentifier(credentialId, 'credentialId');
    const state = await ctx.stub.getState(this.credentialKey(credentialId));
    return state.length > 0;
  }

  public async CreateCredentialDraft(ctx: Context, draftJson: string): Promise<string> {
    this.assertRole(ctx, 'issuer');
    const draft = this.validateDraft(parseJsonObject<CredentialDraftInput>(draftJson, 'draft'));
    if (await this.CredentialExists(ctx, draft.credentialId)) {
      throw new AcademicRecordError('ALREADY_EXISTS', `credential ${draft.credentialId} exists`);
    }

    const privateDetails = this.requiredTransient(ctx, 'gradeDetails');
    this.assertPayloadHash(privateDetails, draft.detailHash, 'gradeDetails');
    const now = this.transactionTime(ctx);
    const record: CredentialRecord = {
      docType: 'gradeCredential',
      ...draft,
      issuerMspId: ctx.clientIdentity.getMSPID(),
      status: 'PENDING_REVIEW',
      version: 1,
      submittedByIdentityHash: this.identityHash(ctx),
      issuedAt: now,
      updatedAt: now,
      transactionId: ctx.stub.getTxID(),
    };

    await this.storeCredential(ctx, record);
    await ctx.stub.putPrivateData(
      this.privateCollection(ctx),
      this.credentialKey(draft.credentialId),
      privateDetails,
    );
    return JSON.stringify(record);
  }

  public async CreateAmendmentDraft(
    ctx: Context,
    previousCredentialId: string,
    draftJson: string,
  ): Promise<string> {
    this.assertRole(ctx, 'issuer');
    const previous = await this.readCredentialRecord(ctx, previousCredentialId);
    if (previous.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'only an active credential can be amended');
    }
    this.assertSameOrganization(ctx, previous.issuerMspId);

    const draft = this.validateDraft(parseJsonObject<CredentialDraftInput>(draftJson, 'draft'));
    if (draft.subjectHash !== previous.subjectHash || draft.courseHash !== previous.courseHash) {
      throw new AcademicRecordError(
        'IMMUTABLE_IDENTITY',
        'an amendment cannot change the subject or course identity',
      );
    }
    if (await this.CredentialExists(ctx, draft.credentialId)) {
      throw new AcademicRecordError('ALREADY_EXISTS', `credential ${draft.credentialId} exists`);
    }

    const privateDetails = this.requiredTransient(ctx, 'gradeDetails');
    this.assertPayloadHash(privateDetails, draft.detailHash, 'gradeDetails');
    const now = this.transactionTime(ctx);
    const amended: CredentialRecord = {
      docType: 'gradeCredential',
      ...draft,
      issuerMspId: previous.issuerMspId,
      status: 'PENDING_REVIEW',
      version: previous.version + 1,
      previousCredentialId: previous.credentialId,
      submittedByIdentityHash: this.identityHash(ctx),
      issuedAt: now,
      updatedAt: now,
      transactionId: ctx.stub.getTxID(),
    };

    await this.storeCredential(ctx, amended);
    await ctx.stub.putPrivateData(
      this.privateCollection(ctx),
      this.credentialKey(amended.credentialId),
      privateDetails,
    );
    return JSON.stringify(amended);
  }

  public async ApproveCredential(ctx: Context, credentialId: string): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    const record = await this.readCredentialRecord(ctx, credentialId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    if (record.status !== 'PENDING_REVIEW') {
      throw new AcademicRecordError('INVALID_STATE', 'only a pending credential can be approved');
    }
    if (record.submittedByIdentityHash === this.identityHash(ctx)) {
      throw new AcademicRecordError(
        'SEPARATION_OF_DUTIES',
        'the submitter cannot approve the draft',
      );
    }

    const now = this.transactionTime(ctx);
    if (record.previousCredentialId) {
      const previous = await this.readCredentialRecord(ctx, record.previousCredentialId);
      if (previous.status !== 'ACTIVE') {
        throw new AcademicRecordError(
          'STALE_AMENDMENT',
          'the previous credential is no longer active',
        );
      }
      previous.status = 'SUPERSEDED';
      previous.updatedAt = now;
      previous.transactionId = ctx.stub.getTxID();
      await this.storeCredential(ctx, previous);
    }

    record.status = 'ACTIVE';
    record.reviewedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = now;
    record.transactionId = ctx.stub.getTxID();
    await this.storeCredential(ctx, record);
    return JSON.stringify(record);
  }

  public async RejectCredential(
    ctx: Context,
    credentialId: string,
    reasonHash: string,
  ): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    assertSha256(reasonHash, 'reasonHash');
    const record = await this.readCredentialRecord(ctx, credentialId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    if (record.status !== 'PENDING_REVIEW') {
      throw new AcademicRecordError('INVALID_STATE', 'only a pending credential can be rejected');
    }
    if (record.submittedByIdentityHash === this.identityHash(ctx)) {
      throw new AcademicRecordError(
        'SEPARATION_OF_DUTIES',
        'the submitter cannot reject the draft',
      );
    }

    record.status = 'REJECTED';
    record.reasonHash = reasonHash;
    record.reviewedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = this.transactionTime(ctx);
    record.transactionId = ctx.stub.getTxID();
    await this.storeCredential(ctx, record);
    return JSON.stringify(record);
  }

  public async RevokeCredential(
    ctx: Context,
    credentialId: string,
    reasonHash: string,
  ): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    assertSha256(reasonHash, 'reasonHash');
    const record = await this.readCredentialRecord(ctx, credentialId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    if (record.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'only an active credential can be revoked');
    }

    record.status = 'REVOKED';
    record.reasonHash = reasonHash;
    record.reviewedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = this.transactionTime(ctx);
    record.transactionId = ctx.stub.getTxID();
    await this.storeCredential(ctx, record);
    return JSON.stringify(record);
  }

  public async ReadCredential(ctx: Context, credentialId: string): Promise<string> {
    return JSON.stringify(await this.readCredentialRecord(ctx, credentialId));
  }

  public async ReadPrivateCredential(ctx: Context, credentialId: string): Promise<string> {
    this.assertRole(ctx, 'student');
    const record = await this.readCredentialRecord(ctx, credentialId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    if (ctx.clientIdentity.getAttributeValue('subject.hash') !== record.subjectHash) {
      throw new AcademicRecordError('FORBIDDEN', 'students may read only their own credential');
    }
    const privateDetails = await ctx.stub.getPrivateData(
      `_implicit_org_${record.issuerMspId}`,
      this.credentialKey(credentialId),
    );
    if (!privateDetails || privateDetails.length === 0) {
      throw new AcademicRecordError('MISSING_PRIVATE_DATA', 'credential details are unavailable');
    }
    return Buffer.from(privateDetails).toString('utf8');
  }

  public async VerifyCredential(
    ctx: Context,
    credentialId: string,
    expectedDetailHash: string,
  ): Promise<string> {
    const record = await this.readCredentialRecord(ctx, credentialId);
    if (expectedDetailHash) {
      assertSha256(expectedDetailHash, 'expectedDetailHash');
    }
    return JSON.stringify({
      credentialId: record.credentialId,
      authentic: expectedDetailHash ? expectedDetailHash === record.detailHash : true,
      valid: record.status === 'ACTIVE',
      status: record.status,
      issuerMspId: record.issuerMspId,
      version: record.version,
      updatedAt: record.updatedAt,
      transactionId: record.transactionId,
    });
  }

  public async SubmitAppeal(
    ctx: Context,
    appealId: string,
    credentialId: string,
    reasonHash: string,
  ): Promise<string> {
    this.assertRole(ctx, 'student');
    assertIdentifier(appealId, 'appealId');
    assertSha256(reasonHash, 'reasonHash');
    const credential = await this.readCredentialRecord(ctx, credentialId);
    if (credential.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'only an active credential can be appealed');
    }
    this.assertSameOrganization(ctx, credential.issuerMspId);
    if (ctx.clientIdentity.getAttributeValue('subject.hash') !== credential.subjectHash) {
      throw new AcademicRecordError('FORBIDDEN', 'students may appeal only their own credential');
    }
    if ((await ctx.stub.getState(this.appealKey(appealId))).length > 0) {
      throw new AcademicRecordError('ALREADY_EXISTS', `appeal ${appealId} exists`);
    }

    const privateDetails = this.requiredTransient(ctx, 'appealDetails');
    this.assertPayloadHash(privateDetails, reasonHash, 'appealDetails');
    const now = this.transactionTime(ctx);
    const appeal: AppealRecord = {
      docType: 'gradeAppeal',
      appealId,
      credentialId,
      subjectHash: credential.subjectHash,
      reasonHash,
      status: 'OPEN',
      submittedAt: now,
      updatedAt: now,
      submittedByIdentityHash: this.identityHash(ctx),
      transactionId: ctx.stub.getTxID(),
    };
    await ctx.stub.putState(this.appealKey(appealId), Buffer.from(JSON.stringify(appeal)));
    await ctx.stub.putPrivateData(
      this.privateCollection(ctx),
      this.appealKey(appealId),
      privateDetails,
    );
    return JSON.stringify(appeal);
  }

  public async ReviewAppeal(
    ctx: Context,
    appealId: string,
    decision: AppealDecision,
    resolutionHash: string,
  ): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    assertIdentifier(appealId, 'appealId');
    assertSha256(resolutionHash, 'resolutionHash');
    if (decision !== 'ACCEPTED' && decision !== 'REJECTED') {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'decision must be ACCEPTED or REJECTED');
    }
    const appeal = await this.readAppealRecord(ctx, appealId);
    const credential = await this.readCredentialRecord(ctx, appeal.credentialId);
    this.assertSameOrganization(ctx, credential.issuerMspId);
    if (appeal.status !== 'OPEN') {
      throw new AcademicRecordError('INVALID_STATE', 'only an open appeal can be reviewed');
    }

    const privateResolution = this.requiredTransient(ctx, 'appealResolution');
    this.assertPayloadHash(privateResolution, resolutionHash, 'appealResolution');

    appeal.status = decision === 'ACCEPTED' ? 'RESOLVED_ACCEPTED' : 'RESOLVED_REJECTED';
    appeal.resolutionHash = resolutionHash;
    appeal.reviewedByIdentityHash = this.identityHash(ctx);
    appeal.updatedAt = this.transactionTime(ctx);
    appeal.transactionId = ctx.stub.getTxID();
    await ctx.stub.putState(this.appealKey(appealId), Buffer.from(JSON.stringify(appeal)));
    await ctx.stub.putPrivateData(
      this.privateCollection(ctx),
      `${this.appealKey(appealId)}:resolution`,
      privateResolution,
    );
    return JSON.stringify(appeal);
  }

  public async ReadAppeal(ctx: Context, appealId: string): Promise<string> {
    return JSON.stringify(await this.readAppealRecord(ctx, appealId));
  }

  private async readCredentialRecord(
    ctx: Context,
    credentialId: string,
  ): Promise<CredentialRecord> {
    assertIdentifier(credentialId, 'credentialId');
    const state = await ctx.stub.getState(this.credentialKey(credentialId));
    if (state.length === 0) {
      throw new AcademicRecordError('NOT_FOUND', `credential ${credentialId} does not exist`);
    }
    return JSON.parse(Buffer.from(state).toString('utf8')) as CredentialRecord;
  }

  private async readAppealRecord(ctx: Context, appealId: string): Promise<AppealRecord> {
    assertIdentifier(appealId, 'appealId');
    const state = await ctx.stub.getState(this.appealKey(appealId));
    if (state.length === 0) {
      throw new AcademicRecordError('NOT_FOUND', `appeal ${appealId} does not exist`);
    }
    return JSON.parse(Buffer.from(state).toString('utf8')) as AppealRecord;
  }

  private async storeCredential(ctx: Context, record: CredentialRecord): Promise<void> {
    await ctx.stub.putState(
      this.credentialKey(record.credentialId),
      Buffer.from(JSON.stringify(record)),
    );
  }

  private validateDraft(draft: CredentialDraftInput): CredentialDraftInput {
    assertIdentifier(draft.credentialId, 'credentialId');
    assertSha256(draft.subjectHash, 'subjectHash');
    assertSha256(draft.courseHash, 'courseHash');
    assertSha256(draft.detailHash, 'detailHash');
    if (typeof draft.schemaVersion !== 'string' || !/^\d+\.\d+$/.test(draft.schemaVersion)) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'schemaVersion must use major.minor form');
    }
    return draft;
  }

  private assertRole(ctx: Context, expected: string): void {
    const actual = ctx.clientIdentity.getAttributeValue('app.role');
    if (actual !== expected) {
      throw new AcademicRecordError('FORBIDDEN', `transaction requires ${expected} role`);
    }
  }

  private assertSameOrganization(ctx: Context, expectedMspId: string): void {
    if (ctx.clientIdentity.getMSPID() !== expectedMspId) {
      throw new AcademicRecordError('FORBIDDEN', 'identity belongs to a different organization');
    }
  }

  private requiredTransient(ctx: Context, key: string): Buffer {
    const value = ctx.stub.getTransient().get(key);
    if (!value || value.length === 0) {
      throw new AcademicRecordError('MISSING_PRIVATE_DATA', `${key} transient value is required`);
    }
    return Buffer.from(value);
  }

  private assertPayloadHash(payload: Buffer, expectedHash: string, label: string): void {
    const actualHash = createHash('sha256').update(payload).digest('hex');
    if (actualHash !== expectedHash) {
      throw new AcademicRecordError('HASH_MISMATCH', `${label} does not match its public hash`);
    }
  }

  private identityHash(ctx: Context): string {
    return createHash('sha256').update(ctx.clientIdentity.getID()).digest('hex');
  }

  private transactionTime(ctx: Context): string {
    const timestamp = ctx.stub.getTxTimestamp();
    const seconds = Number(timestamp.seconds.toString());
    const millis = seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000);
    return new Date(millis).toISOString();
  }

  private privateCollection(ctx: Context): string {
    return `_implicit_org_${ctx.clientIdentity.getMSPID()}`;
  }

  private credentialKey(credentialId: string): string {
    return `credential:${credentialId}`;
  }

  private appealKey(appealId: string): string {
    return `appeal:${appealId}`;
  }
}
