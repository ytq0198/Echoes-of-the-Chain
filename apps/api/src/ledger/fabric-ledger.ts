import { createPrivateKey } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import * as grpc from '@grpc/grpc-js';
import {
  connect,
  type Contract,
  type Gateway,
  hash,
  type Identity,
  type Signer,
  signers,
} from '@hyperledger/fabric-gateway';
import type { LedgerPage, PublicAppealRecord, PublicCredentialRecord } from '@chaingrade/shared';

import type { FabricConfig } from './fabric-config.js';
import type {
  CreateCredentialCommand,
  CreateAppealCommand,
  CredentialLedger,
  CredentialVerification,
  FabricActor,
  ReviewAppealCommand,
} from './types.js';

interface ActorConnection {
  client: grpc.Client;
  gateway: Gateway;
  contract: Contract;
}

const decoder = new TextDecoder();

export class FabricCredentialLedger implements CredentialLedger {
  private readonly connections = new Map<FabricActor, ActorConnection>();

  public constructor(private readonly config: FabricConfig) {}

  public async createDraft(command: CreateCredentialCommand): Promise<PublicCredentialRecord> {
    const contract = await this.contractFor('issuer');
    const result = await contract.submit('CreateCredentialDraft', {
      arguments: [
        JSON.stringify({
          credentialId: command.credentialId,
          subjectHash: command.subjectHash,
          courseHash: command.courseHash,
          detailHash: command.detailHash,
          schemaVersion: command.schemaVersion,
        }),
      ],
      transientData: {
        gradeDetails: command.privateDetails,
      },
    });
    return decodeJson<PublicCredentialRecord>(result);
  }

  public async createAmendment(
    previousCredentialId: string,
    command: CreateCredentialCommand,
  ): Promise<PublicCredentialRecord> {
    const contract = await this.contractFor('issuer');
    const result = await contract.submit('CreateAmendmentDraft', {
      arguments: [
        previousCredentialId,
        JSON.stringify({
          credentialId: command.credentialId,
          subjectHash: command.subjectHash,
          courseHash: command.courseHash,
          detailHash: command.detailHash,
          schemaVersion: command.schemaVersion,
        }),
      ],
      transientData: { gradeDetails: command.privateDetails },
    });
    return decodeJson<PublicCredentialRecord>(result);
  }

  public async approve(credentialId: string): Promise<PublicCredentialRecord> {
    const contract = await this.contractFor('reviewer');
    return decodeJson<PublicCredentialRecord>(
      await contract.submitTransaction('ApproveCredential', credentialId),
    );
  }

  public async read(credentialId: string): Promise<PublicCredentialRecord> {
    const contract = await this.contractFor('reviewer');
    return decodeJson<PublicCredentialRecord>(
      await contract.evaluateTransaction('ReadCredential', credentialId),
    );
  }

  public async listIssued(
    status: PublicCredentialRecord['status'], pageSize: number, bookmark: string,
  ): Promise<LedgerPage<PublicCredentialRecord>> {
    return this.evaluatePage('issuer', 'ListIssuedCredentials', [status, String(pageSize), bookmark]);
  }

  public async listForReview(
    status: PublicCredentialRecord['status'], pageSize: number, bookmark: string,
  ): Promise<LedgerPage<PublicCredentialRecord>> {
    return this.evaluatePage('reviewer', 'ListReviewCredentials', [status, String(pageSize), bookmark]);
  }

  public async listMine(pageSize: number, bookmark: string): Promise<LedgerPage<PublicCredentialRecord>> {
    return this.evaluatePage('student', 'ListMyCredentials', [String(pageSize), bookmark]);
  }

  public async readPrivateDetails(credentialId: string): Promise<Record<string, unknown>> {
    const contract = await this.contractFor('student');
    return decodeJson<Record<string, unknown>>(
      await contract.evaluateTransaction('ReadPrivateCredential', credentialId),
    );
  }

  public async verify(
    credentialId: string,
    expectedDetailHash = '',
  ): Promise<CredentialVerification> {
    const contract = await this.contractFor('reviewer');
    return decodeJson<CredentialVerification>(
      await contract.evaluateTransaction('VerifyCredential', credentialId, expectedDetailHash),
    );
  }

  public async submitAppeal(command: CreateAppealCommand): Promise<PublicAppealRecord> {
    const contract = await this.contractFor('student');
    const result = await contract.submit('SubmitAppeal', {
      arguments: [command.appealId, command.credentialId, command.reasonHash],
      transientData: { appealDetails: command.privateDetails },
    });
    return decodeJson<PublicAppealRecord>(result);
  }

  public async reviewAppeal(command: ReviewAppealCommand): Promise<PublicAppealRecord> {
    const contract = await this.contractFor('reviewer');
    const result = await contract.submit('ReviewAppeal', {
      arguments: [command.appealId, command.decision, command.resolutionHash],
      transientData: { appealResolution: command.privateResolution },
    });
    return decodeJson<PublicAppealRecord>(result);
  }

  public async readAppeal(appealId: string): Promise<PublicAppealRecord> {
    const contract = await this.contractFor('reviewer');
    return decodeJson<PublicAppealRecord>(await contract.evaluateTransaction('ReadAppeal', appealId));
  }

  public async listAppealsForReview(
    status: PublicAppealRecord['status'], pageSize: number, bookmark: string,
  ): Promise<LedgerPage<PublicAppealRecord>> {
    return this.evaluatePage('reviewer', 'ListReviewAppeals', [status, String(pageSize), bookmark]);
  }

  public async listMyAppeals(pageSize: number, bookmark: string): Promise<LedgerPage<PublicAppealRecord>> {
    return this.evaluatePage('student', 'ListMyAppeals', [String(pageSize), bookmark]);
  }

  public close(): void {
    for (const connection of this.connections.values()) {
      connection.gateway.close();
      connection.client.close();
    }
    this.connections.clear();
  }

  private async contractFor(actor: FabricActor): Promise<Contract> {
    const existing = this.connections.get(actor);
    if (existing) return existing.contract;

    const client = await this.newGrpcClient();
    try {
      const gateway = connect({
        client,
        identity: await this.newIdentity(actor),
        signer: await this.newSigner(actor),
        hash: hash.sha256,
        evaluateOptions: () => ({ deadline: Date.now() + 5_000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30_000 }),
        submitOptions: () => ({ deadline: Date.now() + 10_000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
      });
      const contract = gateway
        .getNetwork(this.config.channelName)
        .getContract(this.config.chaincodeName);
      this.connections.set(actor, { client, gateway, contract });
      return contract;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  private async evaluatePage<T>(
    actor: FabricActor,
    transactionName: string,
    args: string[],
  ): Promise<LedgerPage<T>> {
    const contract = await this.contractFor(actor);
    return decodeJson<LedgerPage<T>>(
      await contract.evaluateTransaction(transactionName, ...args),
    );
  }

  private async newGrpcClient(): Promise<grpc.Client> {
    const tlsRootCert = await readFile(this.config.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(this.config.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': this.config.peerHostAlias,
    });
  }

  private async newIdentity(actor: FabricActor): Promise<Identity> {
    const certificate = await readFirstFile(
      path.join(this.config.identityMspPaths[actor], 'signcerts'),
    );
    return { mspId: this.config.mspId, credentials: certificate };
  }

  private async newSigner(actor: FabricActor): Promise<Signer> {
    const privateKeyPem = await readFirstFile(
      path.join(this.config.identityMspPaths[actor], 'keystore'),
    );
    return signers.newPrivateKeySigner(createPrivateKey(privateKeyPem));
  }
}

async function readFirstFile(directory: string): Promise<Buffer> {
  const entries = (await readdir(directory)).sort();
  const first = entries[0];
  if (!first) throw new Error(`No identity material found in ${directory}`);
  return readFile(path.join(directory, first));
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(decoder.decode(bytes)) as T;
}
