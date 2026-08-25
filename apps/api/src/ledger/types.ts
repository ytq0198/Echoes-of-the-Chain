import type { PublicCredentialRecord } from '@chaingrade/shared';

export type FabricActor = 'issuer' | 'reviewer';

export interface CreateCredentialCommand {
  credentialId: string;
  subjectHash: string;
  courseHash: string;
  detailHash: string;
  schemaVersion: string;
  privateDetails: Uint8Array;
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
  approve(credentialId: string): Promise<PublicCredentialRecord>;
  read(credentialId: string): Promise<PublicCredentialRecord>;
  verify(credentialId: string, expectedDetailHash?: string): Promise<CredentialVerification>;
  close(): void;
}

