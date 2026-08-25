import path from 'node:path';

import type { FabricActor } from './types.js';

export interface FabricConfig {
  channelName: string;
  chaincodeName: string;
  mspId: string;
  peerEndpoint: string;
  peerHostAlias: string;
  tlsCertPath: string;
  identityMspPaths: Record<FabricActor, string>;
}

export function loadFabricConfig(env: NodeJS.ProcessEnv = process.env): FabricConfig {
  const projectRoot = env.CHAINGRADE_PROJECT_ROOT ?? process.cwd();
  const networkRoot =
    env.FABRIC_NETWORK_ROOT ?? path.join(projectRoot, '.tools', 'fabric-samples', 'test-network');
  const orgRoot = path.join(
    networkRoot,
    'organizations',
    'peerOrganizations',
    'org1.example.com',
  );

  return {
    channelName: env.FABRIC_CHANNEL_NAME ?? 'chaingrade',
    chaincodeName: env.FABRIC_CHAINCODE_NAME ?? 'grade',
    mspId: env.FABRIC_MSP_ID ?? 'Org1MSP',
    peerEndpoint: env.FABRIC_PEER_ENDPOINT ?? 'localhost:7051',
    peerHostAlias: env.FABRIC_PEER_HOST_ALIAS ?? 'peer0.org1.example.com',
    tlsCertPath:
      env.FABRIC_TLS_CERT_PATH ??
      path.join(orgRoot, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt'),
    identityMspPaths: {
      issuer:
        env.FABRIC_ISSUER_MSP_PATH ??
        path.join(orgRoot, 'users', 'ChaingradeIssuer@org1.example.com', 'msp'),
      reviewer:
        env.FABRIC_REVIEWER_MSP_PATH ??
        path.join(orgRoot, 'users', 'ChaingradeReviewer@org1.example.com', 'msp'),
      student:
        env.FABRIC_STUDENT_MSP_PATH ??
        path.join(orgRoot, 'users', 'ChaingradeStudent@org1.example.com', 'msp'),
    },
  };
}
