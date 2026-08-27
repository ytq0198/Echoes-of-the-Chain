import { createHash } from 'node:crypto';

import { Context, Contract } from 'fabric-contract-api';

import { AcademicRecordError } from './lib/errors';
import { assertIdentifier, assertSha256, parseJsonObject } from './lib/validation';
import type {
  AppealDecision,
  AppealRecord,
  AppealStatus,
  CredentialDraftInput,
  CredentialRecord,
  CredentialStatus,
  DisclosureField,
  DisclosureGrantInput,
  DisclosureGrantRecord,
  LedgerPage,
} from './model';

const credentialStatuses: CredentialStatus[] = [
  'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUPERSEDED', 'REVOKED',
];
const appealStatuses: AppealStatus[] = ['OPEN', 'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED'];
const disclosureFields: DisclosureField[] = ['courseName', 'score', 'grade'];
const maximumDisclosureLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

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
      const previousStatus = previous.status;
      previous.status = 'SUPERSEDED';
      previous.updatedAt = now;
      previous.transactionId = ctx.stub.getTxID();
      await this.storeCredential(ctx, previous, previousStatus);
    }

    const previousStatus = record.status;
    record.status = 'ACTIVE';
    record.reviewedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = now;
    record.transactionId = ctx.stub.getTxID();
    await this.storeCredential(ctx, record, previousStatus);
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

    const privateDecision = this.requiredTransient(ctx, 'credentialDecision');
    this.assertPayloadHash(privateDecision, reasonHash, 'credentialDecision');

    const previousStatus = record.status;
    record.status = 'REJECTED';
    record.reasonHash = reasonHash;
    record.reviewedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = this.transactionTime(ctx);
    record.transactionId = ctx.stub.getTxID();
    await this.storeCredential(ctx, record, previousStatus);
    await ctx.stub.putPrivateData(
      this.privateCollection(ctx),
      `${this.credentialKey(credentialId)}:decision`,
      privateDecision,
    );
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

    const privateDecision = this.requiredTransient(ctx, 'credentialDecision');
    this.assertPayloadHash(privateDecision, reasonHash, 'credentialDecision');

    const previousStatus = record.status;
    record.status = 'REVOKED';
    record.reasonHash = reasonHash;
    record.reviewedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = this.transactionTime(ctx);
    record.transactionId = ctx.stub.getTxID();
    await this.storeCredential(ctx, record, previousStatus);
    await ctx.stub.putPrivateData(
      this.privateCollection(ctx),
      `${this.credentialKey(credentialId)}:decision`,
      privateDecision,
    );
    return JSON.stringify(record);
  }

  public async ReadCredential(ctx: Context, credentialId: string): Promise<string> {
    return JSON.stringify(await this.readCredentialRecord(ctx, credentialId));
  }

  public async ListIssuedCredentials(
    ctx: Context,
    status: string,
    pageSize: string,
    bookmark: string,
  ): Promise<string> {
    this.assertRole(ctx, 'issuer');
    return JSON.stringify(await this.listCredentialsByStatus(ctx, status, pageSize, bookmark));
  }

  public async ListReviewCredentials(
    ctx: Context,
    status: string,
    pageSize: string,
    bookmark: string,
  ): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    return JSON.stringify(await this.listCredentialsByStatus(ctx, status, pageSize, bookmark));
  }

  public async ListMyCredentials(
    ctx: Context,
    pageSize: string,
    bookmark: string,
  ): Promise<string> {
    this.assertRole(ctx, 'student');
    const subjectHash = this.requiredSubjectHash(ctx);
    return JSON.stringify(
      await this.queryIndex<CredentialRecord>(
        ctx,
        'credential~subject',
        [ctx.clientIdentity.getMSPID(), subjectHash],
        this.parsePageSize(pageSize),
        bookmark,
        (id) => this.credentialKey(id),
      ),
    );
  }

  public async CreateDisclosureGrant(ctx: Context, grantJson: string): Promise<string> {
    this.assertRole(ctx, 'student');
    const input = this.validateDisclosureGrant(
      parseJsonObject<DisclosureGrantInput>(grantJson, 'grant'),
      this.transactionMillis(ctx),
    );
    const credential = await this.readCredentialRecord(ctx, input.credentialId);
    this.assertSameOrganization(ctx, credential.issuerMspId);
    const subjectHash = this.requiredSubjectHash(ctx);
    if (credential.subjectHash !== subjectHash) {
      throw new AcademicRecordError('FORBIDDEN', 'students may share only their own credential');
    }
    if (credential.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'only an active credential can be shared');
    }
    if ((await ctx.stub.getState(this.disclosureKey(input.grantId))).length > 0) {
      throw new AcademicRecordError('ALREADY_EXISTS', `disclosure ${input.grantId} exists`);
    }

    const now = this.transactionTime(ctx);
    const record: DisclosureGrantRecord = {
      docType: 'gradeDisclosureGrant',
      ...input,
      subjectHash,
      issuerMspId: credential.issuerMspId,
      usedCount: 0,
      status: 'ACTIVE',
      createdByIdentityHash: this.identityHash(ctx),
      createdAt: now,
      updatedAt: now,
      transactionId: ctx.stub.getTxID(),
    };
    await this.storeDisclosure(ctx, record);
    return JSON.stringify(record);
  }

  public async ConsumeDisclosureGrant(ctx: Context, grantId: string): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    const record = await this.readDisclosureRecord(ctx, grantId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    await this.assertDisclosureUsable(ctx, record);
    this.assertDisclosureAccess(ctx, record);

    record.usedCount += 1;
    record.status = record.usedCount >= record.maxUses ? 'CONSUMED' : 'ACTIVE';
    record.lastConsumedByIdentityHash = this.identityHash(ctx);
    record.updatedAt = this.transactionTime(ctx);
    record.transactionId = ctx.stub.getTxID();
    await this.storeDisclosure(ctx, record);
    return JSON.stringify(record);
  }

  public async ReadDisclosureGrant(ctx: Context, grantId: string): Promise<string> {
    return JSON.stringify(await this.readDisclosureRecord(ctx, grantId));
  }

  public async EvaluateDisclosureGrant(ctx: Context, grantId: string): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    const record = await this.readDisclosureRecord(ctx, grantId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    await this.assertDisclosureUsable(ctx, record);
    this.assertDisclosureAccess(ctx, record);
    const privateDetails = await ctx.stub.getPrivateData(
      `_implicit_org_${record.issuerMspId}`,
      this.credentialKey(record.credentialId),
    );
    if (!privateDetails || privateDetails.length === 0) {
      throw new AcademicRecordError('MISSING_PRIVATE_DATA', 'credential details are unavailable');
    }
    const details = parseJsonObject<Record<string, unknown>>(
      Buffer.from(privateDetails).toString('utf8'),
      'gradeDetails',
    );
    return JSON.stringify(Object.fromEntries(
      record.selectedFields
        .filter((field) => Object.hasOwn(details, field))
        .map((field) => [field, details[field]]),
    ));
  }

  public async RevokeDisclosureGrant(ctx: Context, grantId: string): Promise<string> {
    this.assertRole(ctx, 'student');
    const record = await this.readDisclosureRecord(ctx, grantId);
    this.assertSameOrganization(ctx, record.issuerMspId);
    if (record.subjectHash !== this.requiredSubjectHash(ctx)) {
      throw new AcademicRecordError('FORBIDDEN', 'students may revoke only their own disclosure');
    }
    if (record.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'only an active disclosure can be revoked');
    }
    record.status = 'REVOKED';
    record.updatedAt = this.transactionTime(ctx);
    record.transactionId = ctx.stub.getTxID();
    await this.storeDisclosure(ctx, record);
    return JSON.stringify(record);
  }

  public async ListMyDisclosureGrants(
    ctx: Context,
    pageSize: string,
    bookmark: string,
  ): Promise<string> {
    this.assertRole(ctx, 'student');
    const subjectHash = this.requiredSubjectHash(ctx);
    return JSON.stringify(await this.queryIndex<DisclosureGrantRecord>(
      ctx,
      'disclosure~subject',
      [ctx.clientIdentity.getMSPID(), subjectHash],
      this.parsePageSize(pageSize),
      bookmark,
      (id) => this.disclosureKey(id),
    ));
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
      issuerMspId: credential.issuerMspId,
      reasonHash,
      status: 'OPEN',
      submittedAt: now,
      updatedAt: now,
      submittedByIdentityHash: this.identityHash(ctx),
      transactionId: ctx.stub.getTxID(),
    };
    await this.storeAppeal(ctx, appeal);
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

    const previousStatus = appeal.status;
    appeal.status = decision === 'ACCEPTED' ? 'RESOLVED_ACCEPTED' : 'RESOLVED_REJECTED';
    appeal.resolutionHash = resolutionHash;
    appeal.reviewedByIdentityHash = this.identityHash(ctx);
    appeal.updatedAt = this.transactionTime(ctx);
    appeal.transactionId = ctx.stub.getTxID();
    await this.storeAppeal(ctx, appeal, previousStatus);
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

  public async ListReviewAppeals(
    ctx: Context,
    status: string,
    pageSize: string,
    bookmark: string,
  ): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    const normalizedStatus = this.parseAppealStatus(status, 'OPEN');
    return JSON.stringify(
      await this.queryIndex<AppealRecord>(
        ctx,
        'appeal~status',
        [ctx.clientIdentity.getMSPID(), normalizedStatus],
        this.parsePageSize(pageSize),
        bookmark,
        (id) => this.appealKey(id),
      ),
    );
  }

  public async ListMyAppeals(
    ctx: Context,
    pageSize: string,
    bookmark: string,
  ): Promise<string> {
    this.assertRole(ctx, 'student');
    const subjectHash = this.requiredSubjectHash(ctx);
    return JSON.stringify(
      await this.queryIndex<AppealRecord>(
        ctx,
        'appeal~subject',
        [ctx.clientIdentity.getMSPID(), subjectHash],
        this.parsePageSize(pageSize),
        bookmark,
        (id) => this.appealKey(id),
      ),
    );
  }

  public async RebuildIndexes(ctx: Context): Promise<string> {
    this.assertRole(ctx, 'reviewer');
    let credentials = 0;
    let appeals = 0;
    for await (const entry of ctx.stub.getStateByRange('credential:', 'credential;')) {
      const record = JSON.parse(Buffer.from(entry.value).toString('utf8')) as CredentialRecord;
      if (record.docType === 'gradeCredential') {
        this.assertSameOrganization(ctx, record.issuerMspId);
        await this.putCredentialIndexes(ctx, record);
        credentials += 1;
      }
    }
    for await (const entry of ctx.stub.getStateByRange('appeal:', 'appeal;')) {
      const record = JSON.parse(Buffer.from(entry.value).toString('utf8')) as AppealRecord;
      if (record.docType === 'gradeAppeal') {
        const credential = await this.readCredentialRecord(ctx, record.credentialId);
        this.assertSameOrganization(ctx, credential.issuerMspId);
        record.issuerMspId = credential.issuerMspId;
        await this.storeAppeal(ctx, record);
        appeals += 1;
      }
    }
    return JSON.stringify({ credentials, appeals });
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

  private async readDisclosureRecord(
    ctx: Context,
    grantId: string,
  ): Promise<DisclosureGrantRecord> {
    assertIdentifier(grantId, 'grantId');
    const state = await ctx.stub.getState(this.disclosureKey(grantId));
    if (state.length === 0) {
      throw new AcademicRecordError('NOT_FOUND', `disclosure ${grantId} does not exist`);
    }
    return JSON.parse(Buffer.from(state).toString('utf8')) as DisclosureGrantRecord;
  }

  private async assertDisclosureUsable(
    ctx: Context,
    record: DisclosureGrantRecord,
  ): Promise<void> {
    if (record.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'only an active disclosure can be consumed');
    }
    if (this.transactionMillis(ctx) >= Date.parse(record.expiresAt)) {
      throw new AcademicRecordError('EXPIRED', 'disclosure authorization has expired');
    }
    if (record.usedCount >= record.maxUses) {
      throw new AcademicRecordError('INVALID_STATE', 'disclosure authorization is exhausted');
    }
    const credential = await this.readCredentialRecord(ctx, record.credentialId);
    if (credential.status !== 'ACTIVE') {
      throw new AcademicRecordError('INVALID_STATE', 'the linked credential is no longer active');
    }
  }

  private assertDisclosureAccess(ctx: Context, record: DisclosureGrantRecord): void {
    const access = parseJsonObject<{ token: string; purpose: string; verifier: string }>(
      this.requiredTransient(ctx, 'disclosureAccess').toString('utf8'),
      'disclosureAccess',
    );
    if (
      typeof access.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(access.token) ||
      typeof access.purpose !== 'string' || typeof access.verifier !== 'string'
    ) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'disclosure access is malformed');
    }
    if (
      this.hashText(access.token) !== record.tokenHash ||
      this.hashText(access.purpose.trim()) !== record.purposeHash ||
      this.hashText(access.verifier.trim()) !== record.verifierHash
    ) {
      throw new AcademicRecordError('FORBIDDEN', 'disclosure access binding does not match');
    }
  }

  private async storeCredential(
    ctx: Context,
    record: CredentialRecord,
    previousStatus?: CredentialStatus,
  ): Promise<void> {
    if (previousStatus && previousStatus !== record.status) {
      await ctx.stub.deleteState(
        ctx.stub.createCompositeKey('credential~status', [
          record.issuerMspId, previousStatus, record.credentialId,
        ]),
      );
    }
    await ctx.stub.putState(
      this.credentialKey(record.credentialId),
      Buffer.from(JSON.stringify(record)),
    );
    await this.putCredentialIndexes(ctx, record);
  }

  private async putCredentialIndexes(ctx: Context, record: CredentialRecord): Promise<void> {
    await ctx.stub.putState(
      ctx.stub.createCompositeKey('credential~status', [
        record.issuerMspId, record.status, record.credentialId,
      ]),
      Buffer.from([0]),
    );
    await ctx.stub.putState(
      ctx.stub.createCompositeKey('credential~subject', [
        record.issuerMspId, record.subjectHash, record.credentialId,
      ]),
      Buffer.from([0]),
    );
  }

  private async storeAppeal(
    ctx: Context,
    record: AppealRecord,
    previousStatus?: AppealStatus,
  ): Promise<void> {
    if (previousStatus && previousStatus !== record.status) {
      await ctx.stub.deleteState(
        ctx.stub.createCompositeKey('appeal~status', [
          record.issuerMspId, previousStatus, record.appealId,
        ]),
      );
    }
    await ctx.stub.putState(this.appealKey(record.appealId), Buffer.from(JSON.stringify(record)));
    await ctx.stub.putState(
      ctx.stub.createCompositeKey('appeal~status', [
        record.issuerMspId, record.status, record.appealId,
      ]),
      Buffer.from([0]),
    );
    await ctx.stub.putState(
      ctx.stub.createCompositeKey('appeal~subject', [
        record.issuerMspId, record.subjectHash, record.appealId,
      ]),
      Buffer.from([0]),
    );
  }

  private async storeDisclosure(ctx: Context, record: DisclosureGrantRecord): Promise<void> {
    await ctx.stub.putState(
      this.disclosureKey(record.grantId),
      Buffer.from(JSON.stringify(record)),
    );
    await ctx.stub.putState(
      ctx.stub.createCompositeKey('disclosure~subject', [
        record.issuerMspId, record.subjectHash, record.grantId,
      ]),
      Buffer.from([0]),
    );
  }

  private async listCredentialsByStatus(
    ctx: Context,
    status: string,
    pageSize: string,
    bookmark: string,
  ): Promise<LedgerPage<CredentialRecord>> {
    const normalizedStatus = this.parseCredentialStatus(status, 'PENDING_REVIEW');
    return this.queryIndex<CredentialRecord>(
      ctx,
      'credential~status',
      [ctx.clientIdentity.getMSPID(), normalizedStatus],
      this.parsePageSize(pageSize),
      bookmark,
      (id) => this.credentialKey(id),
    );
  }

  private async queryIndex<T>(
    ctx: Context,
    objectType: string,
    attributes: string[],
    pageSize: number,
    bookmark: string,
    stateKey: (id: string) => string,
  ): Promise<LedgerPage<T>> {
    let cursor = '';
    if (bookmark) {
      try {
        cursor = Buffer.from(bookmark, 'base64url').toString('utf8');
      } catch {
        throw new AcademicRecordError('INVALID_ARGUMENT', 'bookmark is invalid');
      }
    }
    const iterator = await ctx.stub.getStateByPartialCompositeKey(objectType, attributes);
    const items: T[] = [];
    let lastKey = '';
    let hasMore = false;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        if (cursor && next.value.key <= cursor) continue;
        if (items.length >= pageSize) {
          hasMore = true;
          break;
        }
        const parts = ctx.stub.splitCompositeKey(next.value.key);
        const id = parts.attributes.at(-1);
        if (!id) continue;
        const value = await ctx.stub.getState(stateKey(id));
        if (value.length > 0) {
          items.push(JSON.parse(Buffer.from(value).toString('utf8')) as T);
          lastKey = next.value.key;
        }
      }
    } finally {
      await iterator.close();
    }
    return {
      items,
      bookmark: hasMore && lastKey ? Buffer.from(lastKey).toString('base64url') : '',
      fetchedRecordsCount: items.length,
    };
  }

  private parsePageSize(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'pageSize must be an integer from 1 to 50');
    }
    return parsed;
  }

  private parseCredentialStatus(value: string, fallback: CredentialStatus): CredentialStatus {
    const normalized = value || fallback;
    if (!credentialStatuses.includes(normalized as CredentialStatus)) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'unsupported credential status');
    }
    return normalized as CredentialStatus;
  }

  private parseAppealStatus(value: string, fallback: AppealStatus): AppealStatus {
    const normalized = value || fallback;
    if (!appealStatuses.includes(normalized as AppealStatus)) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'unsupported appeal status');
    }
    return normalized as AppealStatus;
  }

  private requiredSubjectHash(ctx: Context): string {
    const subjectHash = ctx.clientIdentity.getAttributeValue('subject.hash');
    if (!subjectHash) throw new AcademicRecordError('FORBIDDEN', 'subject.hash attribute is required');
    assertSha256(subjectHash, 'subject.hash');
    return subjectHash;
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

  private validateDisclosureGrant(
    input: DisclosureGrantInput,
    transactionMillis: number,
  ): DisclosureGrantInput {
    assertIdentifier(input.grantId, 'grantId');
    assertIdentifier(input.credentialId, 'credentialId');
    assertSha256(input.tokenHash, 'tokenHash');
    assertSha256(input.purposeHash, 'purposeHash');
    assertSha256(input.verifierHash, 'verifierHash');
    if (!Array.isArray(input.selectedFields) || input.selectedFields.length < 1) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'selectedFields cannot be empty');
    }
    if (
      new Set(input.selectedFields).size !== input.selectedFields.length ||
      input.selectedFields.some((field) => !disclosureFields.includes(field))
    ) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'selectedFields contains unsupported values');
    }
    if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 10) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'maxUses must be an integer from 1 to 10');
    }
    const expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= transactionMillis) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'expiresAt must be in the future');
    }
    if (expiresAt - transactionMillis > maximumDisclosureLifetimeMs) {
      throw new AcademicRecordError('INVALID_ARGUMENT', 'expiresAt cannot exceed 30 days');
    }
    return input;
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
    return new Date(this.transactionMillis(ctx)).toISOString();
  }

  private transactionMillis(ctx: Context): number {
    const timestamp = ctx.stub.getTxTimestamp();
    const seconds = Number(timestamp.seconds.toString());
    return seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000);
  }

  private hashText(value: string): string {
    return createHash('sha256').update(value).digest('hex');
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

  private disclosureKey(grantId: string): string {
    return `disclosure:${grantId}`;
  }
}
