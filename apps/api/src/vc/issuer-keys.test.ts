import { generateKeyPairSync, sign, verify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  generateEd25519KeyPair,
  loadIssuerKeys,
  privateKeyFromPem,
  publicKeyFromPem,
} from './issuer-keys.js';

describe('generateEd25519KeyPair', () => {
  it('produces a usable Ed25519 key pair that can sign and verify', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    const privateKey = privateKeyFromPem(privateKeyPem);
    const publicKey = publicKeyFromPem(publicKeyPem);

    expect(privateKey.asymmetricKeyType).toBe('ed25519');
    expect(publicKey.asymmetricKeyType).toBe('ed25519');

    const message = Buffer.from('hello, chain');
    const signature = sign(null, message, privateKey);
    expect(verify(null, message, publicKey, signature)).toBe(true);
  });
});

describe('loadIssuerKeys', () => {
  it('loads keys from the environment and exposes the verification method', () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    const keys = loadIssuerKeys({
      VC_ISSUER_PRIVATE_KEY: privateKeyPem,
      VC_ISSUER_PUBLIC_KEY: publicKeyPem,
      VC_PUBLIC_BASE_URL: 'https://credentials.example.edu/',
    });

    expect(keys.verificationMethod).toBe('did:example:chaingrade-issuer#key-1');
    expect(keys.privateKey.asymmetricKeyType).toBe('ed25519');
    expect(keys.publicKey.asymmetricKeyType).toBe('ed25519');
    expect(keys.publicBaseUrl).toBe('https://credentials.example.edu');
  });

  it('throws when the private key environment variable is missing', () => {
    expect(() => loadIssuerKeys({ VC_ISSUER_PUBLIC_KEY: 'pk' })).toThrow('VC_ISSUER_PRIVATE_KEY');
  });

  it('throws when the public key environment variable is missing', () => {
    expect(() => loadIssuerKeys({ VC_ISSUER_PRIVATE_KEY: 'pk' })).toThrow('VC_ISSUER_PUBLIC_KEY');
  });

  it('rejects a mismatched key pair', () => {
    const first = generateEd25519KeyPair();
    const second = generateEd25519KeyPair();
    expect(() =>
      loadIssuerKeys({
        VC_ISSUER_PRIVATE_KEY: first.privateKeyPem,
        VC_ISSUER_PUBLIC_KEY: second.publicKeyPem,
        VC_PUBLIC_BASE_URL: 'https://credentials.example.edu',
      }),
    ).toThrow('do not match');
  });

  it('requires a safe public deployment URL', () => {
    const pair = generateEd25519KeyPair();
    expect(() =>
      loadIssuerKeys({
        VC_ISSUER_PRIVATE_KEY: pair.privateKeyPem,
        VC_ISSUER_PUBLIC_KEY: pair.publicKeyPem,
        VC_PUBLIC_BASE_URL: 'http://credentials.example.edu',
      }),
    ).toThrow('must use HTTPS');
  });
});

describe('key parsing', () => {
  it('rejects an invalid private key PEM', () => {
    expect(() => privateKeyFromPem('not a pem')).toThrow('Invalid Ed25519 private key PEM');
  });

  it('rejects an invalid public key PEM', () => {
    expect(() => publicKeyFromPem('not a pem')).toThrow('Invalid Ed25519 public key PEM');
  });

  it('rejects a non-Ed25519 private key', () => {
    const { privateKey: rsaKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(() => privateKeyFromPem(rsaKey)).toThrow('must be Ed25519');
  });
});
