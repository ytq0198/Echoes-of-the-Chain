import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

import { verificationMethod } from '@chaingrade/shared';

export interface IssuerKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  verificationMethod: typeof verificationMethod;
}

export interface GeneratedKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

const PRIVATE_KEY_ENV = 'VC_ISSUER_PRIVATE_KEY';
const PUBLIC_KEY_ENV = 'VC_ISSUER_PUBLIC_KEY';

// Loads the issuer Ed25519 keys from environment variables. The private key must
// never be committed to the repository; it is injected from a private process
// environment only.
export function loadIssuerKeys(env: NodeJS.ProcessEnv = process.env): IssuerKeys {
  const privateKeyPem = env[PRIVATE_KEY_ENV];
  const publicKeyPem = env[PUBLIC_KEY_ENV];

  if (!privateKeyPem || privateKeyPem.trim() === '') {
    throw new Error(`Missing environment variable ${PRIVATE_KEY_ENV}`);
  }
  if (!publicKeyPem || publicKeyPem.trim() === '') {
    throw new Error(`Missing environment variable ${PUBLIC_KEY_ENV}`);
  }

  return {
    privateKey: privateKeyFromPem(privateKeyPem),
    publicKey: publicKeyFromPem(publicKeyPem),
    verificationMethod,
  };
}

export function privateKeyFromPem(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new Error('Invalid Ed25519 private key PEM');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Private key must be Ed25519');
  }
  return key;
}

export function publicKeyFromPem(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey(pem);
  } catch {
    throw new Error('Invalid Ed25519 public key PEM');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Public key must be Ed25519');
  }
  return key;
}

// Generates a fresh Ed25519 key pair. Intended for local demo bootstrap and tests;
// the production issuer key pair is injected via the environment.
export function generateEd25519KeyPair(): GeneratedKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}
