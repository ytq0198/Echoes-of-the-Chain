import type {
  DisclosureField,
  LedgerPage,
  PublicAppealRecord,
  PublicCredentialRecord,
  PublicDisclosureGrant,
} from '@chaingrade/shared';

export type FabricActor = 'issuer' | 'reviewer' | 'student';

export interface CreateCredentialCommand {
  credentialId: string;
  subjectHash: string;
  courseHash: string;
  detailHash: string;
  schemaVersion: string;
  privateDetails: Uint8Array;
}

export interface CreateAppealCommand {
  appealId: string;
  credentialId: string;
  reasonHash: string;
  privateDetails: Uint8Array;
}

export interface ReviewAppealCommand {
  appealId: string;
  decision: 'ACCEPTED' | 'REJECTED';
  resolutionHash: string;
  privateResolution: Uint8Array;
}

export interface CredentialDecisionCommand {
  credentialId: string;
  reasonHash: string;
  privateDecision: Uint8Array;
}

export interface CreateDisclosureCommand {
  grantId: string;
  credentialId: string;
  tokenHash: string;
  purposeHash: string;
  verifierHash: string;
  selectedFields: DisclosureField[];
  expiresAt: string;
  maxUses: number;
}

export interface ConsumeDisclosureCommand {
  grantId: string;
  privateAccess: Uint8Array;
}

export interface CredentialVerification {
  credentialId: string;
  authentic: boolean;
  valid: boolean;
  status: PublicCredentialRecord['status'];
  issuerMspId: string;
  version: number;
  updatedAt: string;
  transactionId: string;
}

export interface CredentialLedger {
  createDraft(command: CreateCredentialCommand): Promise<PublicCredentialRecord>;
  createAmendment(
    previousCredentialId: string,
    command: CreateCredentialCommand,
  ): Promise<PublicCredentialRecord>;
  approve(credentialId: string): Promise<PublicCredentialRecord>;
  reject(command: CredentialDecisionCommand): Promise<PublicCredentialRecord>;
  revoke(command: CredentialDecisionCommand): Promise<PublicCredentialRecord>;
  read(credentialId: string): Promise<PublicCredentialRecord>;
  listIssued(status: PublicCredentialRecord['status'], pageSize: number, bookmark: string): Promise<LedgerPage<PublicCredentialRecord>>;
  listForReview(status: PublicCredentialRecord['status'], pageSize: number, bookmark: string): Promise<LedgerPage<PublicCredentialRecord>>;
  listMine(pageSize: number, bookmark: string): Promise<LedgerPage<PublicCredentialRecord>>;
  readPrivateDetails(credentialId: string): Promise<Record<string, unknown>>;
  verify(credentialId: string, expectedDetailHash?: string): Promise<CredentialVerification>;
  createDisclosure(command: CreateDisclosureCommand): Promise<PublicDisclosureGrant>;
  evaluateDisclosure(command: ConsumeDisclosureCommand): Promise<Partial<Record<DisclosureField, unknown>>>;
  consumeDisclosure(command: ConsumeDisclosureCommand): Promise<PublicDisclosureGrant>;
  revokeDisclosure(grantId: string): Promise<PublicDisclosureGrant>;
  listMyDisclosures(pageSize: number, bookmark: string): Promise<LedgerPage<PublicDisclosureGrant>>;
  submitAppeal(command: CreateAppealCommand): Promise<PublicAppealRecord>;
  reviewAppeal(command: ReviewAppealCommand): Promise<PublicAppealRecord>;
  readAppeal(appealId: string): Promise<PublicAppealRecord>;
  listAppealsForReview(status: PublicAppealRecord['status'], pageSize: number, bookmark: string): Promise<LedgerPage<PublicAppealRecord>>;
  listMyAppeals(pageSize: number, bookmark: string): Promise<LedgerPage<PublicAppealRecord>>;
  close(): void;
}
