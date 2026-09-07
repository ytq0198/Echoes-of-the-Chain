import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

import { verificationMethod } from '@chaingrade/shared';

export interface IssuerKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  verificationMethod: typeof verificationMethod;
  publicBaseUrl: string;
}

export interface GeneratedKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

const PRIVATE_KEY_ENV = 'VC_ISSUER_PRIVATE_KEY';
const PUBLIC_KEY_ENV = 'VC_ISSUER_PUBLIC_KEY';
const PUBLIC_BASE_URL_ENV = 'VC_PUBLIC_BASE_URL';

// Loads the issuer Ed25519 keys from environment variables. The private key must
// never be committed to the repository; it is injected from a private process
// environment only.
export function loadIssuerKeys(env: NodeJS.ProcessEnv = process.env): IssuerKeys {
  const privateKeyPem = env[PRIVATE_KEY_ENV];
  const publicKeyPem = env[PUBLIC_KEY_ENV];
  const publicBaseUrlText = env[PUBLIC_BASE_URL_ENV];

  if (!privateKeyPem || privateKeyPem.trim() === '') {
    throw new Error(`Missing environment variable ${PRIVATE_KEY_ENV}`);
  }
  if (!publicKeyPem || publicKeyPem.trim() === '') {
    throw new Error(`Missing environment variable ${PUBLIC_KEY_ENV}`);
  }
  if (!publicBaseUrlText || publicBaseUrlText.trim() === '') {
    throw new Error(`Missing environment variable ${PUBLIC_BASE_URL_ENV}`);
  }

  const publicBaseUrl = parsePublicBaseUrl(publicBaseUrlText);
  const privateKey = privateKeyFromPem(privateKeyPem);
  const publicKey = publicKeyFromPem(publicKeyPem);
  const challenge = randomBytes(32);
  if (!verify(null, challenge, publicKey, sign(null, challenge, privateKey))) {
    throw new Error('VC issuer private and public keys do not match');
  }

  return {
    privateKey,
    publicKey,
    verificationMethod,
    publicBaseUrl,
  };
}

function parsePublicBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${PUBLIC_BASE_URL_ENV} must be a valid absolute URL`);
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  ) {
    throw new Error(`${PUBLIC_BASE_URL_ENV} must use HTTPS except for localhost`);
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
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
