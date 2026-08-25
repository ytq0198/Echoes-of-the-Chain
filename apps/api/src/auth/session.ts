import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { FastifyRequest } from 'fastify';

export type AppRole = 'issuer' | 'reviewer' | 'student';

export interface SessionClaims {
  username: string;
  role: AppRole;
  subjectHash?: string;
  csrfToken: string;
  issuedAt: number;
  expiresAt: number;
}

interface Account {
  username: string;
  password: string;
  role: AppRole;
  subjectHash?: string;
}

export interface SessionConfig {
  secret: string;
  accounts: Account[];
  allowedOrigins: string[];
  ttlSeconds: number;
  secureCookie: boolean;
  allowNonBrowserClients: boolean;
}

export class AuthenticationError extends Error {
  public constructor(public readonly code: 'AUTHENTICATION_REQUIRED' | 'ROLE_FORBIDDEN' | 'CSRF_INVALID', message: string) {
    super(`${code}: ${message}`);
    this.name = 'AuthenticationError';
  }
}

export class SessionService {
  public readonly cookieName: string;

  public constructor(private readonly config: SessionConfig) {
    this.cookieName = config.secureCookie ? '__Host-chaingrade_session' : 'chaingrade_session';
  }

  public login(username: string, password: string, now = Date.now()): { claims: SessionClaims; token: string } {
    const account = this.config.accounts.find((candidate) => candidate.username === username);
    if (!account || !safePasswordEqual(password, account.password)) {
      throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'invalid credentials');
    }
    const claims: SessionClaims = {
      username: account.username,
      role: account.role,
      ...(account.subjectHash ? { subjectHash: account.subjectHash } : {}),
      csrfToken: randomBytes(24).toString('base64url'),
      issuedAt: Math.floor(now / 1000),
      expiresAt: Math.floor(now / 1000) + this.config.ttlSeconds,
    };
    return { claims, token: this.sign(claims) };
  }

  public authenticate(request: FastifyRequest, now = Date.now()): SessionClaims {
    const token = readCookie(request.headers.cookie, this.cookieName);
    if (!token) throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session cookie is missing');
    return this.verify(token, now);
  }

  public authorize(
    request: FastifyRequest,
    expectedRole: AppRole,
    options: { csrf?: boolean } = {},
  ): SessionClaims {
    const claims = this.authenticate(request);
    if (claims.role !== expectedRole) {
      throw new AuthenticationError('ROLE_FORBIDDEN', `requires ${expectedRole} role`);
    }
    if (options.csrf) this.assertCsrf(request, claims);
    return claims;
  }

  public assertRequestOrigin(request: FastifyRequest): void {
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
      throw new AuthenticationError('CSRF_INVALID', 'cross-site request rejected');
    }
    const origin = request.headers.origin;
    if (typeof origin === 'string' && this.config.allowedOrigins.includes(origin)) return;
    if (this.config.allowNonBrowserClients && origin === undefined) return;
    throw new AuthenticationError('CSRF_INVALID', 'request origin is not allowed');
  }

  public sessionCookie(token: string): string {
    return [
      `${this.cookieName}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${this.config.ttlSeconds}`,
      ...(this.config.secureCookie ? ['Secure'] : []),
    ].join('; ');
  }

  public clearCookie(): string {
    return [
      `${this.cookieName}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=0',
      ...(this.config.secureCookie ? ['Secure'] : []),
    ].join('; ');
  }

  private assertCsrf(request: FastifyRequest, claims: SessionClaims): void {
    this.assertRequestOrigin(request);
    const supplied = request.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || !safePasswordEqual(supplied, claims.csrfToken)) {
      throw new AuthenticationError('CSRF_INVALID', 'CSRF token is invalid');
    }
  }

  private sign(claims: SessionClaims): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.config.secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verify(token: string, now: number): SessionClaims {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) {
      throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session token is malformed');
    }
    const expected = createHmac('sha256', this.config.secret).update(payload).digest();
    let supplied: Buffer;
    try { supplied = Buffer.from(signature, 'base64url'); }
    catch { throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session signature is invalid'); }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session signature is invalid');
    }
    let claims: SessionClaims;
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims; }
    catch { throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session payload is invalid'); }
    if (!claims.username || !['issuer', 'reviewer', 'student'].includes(claims.role) || !claims.csrfToken || !Number.isInteger(claims.expiresAt)) {
      throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session claims are invalid');
    }
    if (claims.expiresAt <= Math.floor(now / 1000)) {
      throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'session has expired');
    }
    return claims;
  }
}

export function loadSessionConfig(env: NodeJS.ProcessEnv = process.env): SessionConfig | undefined {
  if (env.AUTH_ENABLED !== 'true') return undefined;
  const secret = requiredSecret(env.AUTH_SESSION_SECRET, 'AUTH_SESSION_SECRET', 32);
  const studentSubjectHash = requiredPattern(env.AUTH_STUDENT_SUBJECT_HASH, 'AUTH_STUDENT_SUBJECT_HASH', /^[a-f0-9]{64}$/);
  return {
    secret,
    accounts: [
      { username: env.AUTH_ISSUER_USERNAME ?? 'demo-issuer', password: requiredSecret(env.AUTH_ISSUER_PASSWORD, 'AUTH_ISSUER_PASSWORD', 12), role: 'issuer' },
      { username: env.AUTH_REVIEWER_USERNAME ?? 'demo-reviewer', password: requiredSecret(env.AUTH_REVIEWER_PASSWORD, 'AUTH_REVIEWER_PASSWORD', 12), role: 'reviewer' },
      { username: env.AUTH_STUDENT_USERNAME ?? 'demo-student', password: requiredSecret(env.AUTH_STUDENT_PASSWORD, 'AUTH_STUDENT_PASSWORD', 12), role: 'student', subjectHash: studentSubjectHash },
    ],
    allowedOrigins: (env.AUTH_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    ttlSeconds: Number(env.AUTH_TTL_SECONDS ?? 3_600),
    secureCookie: env.AUTH_SECURE_COOKIE === 'true',
    allowNonBrowserClients: env.AUTH_ALLOW_NON_BROWSER_CLIENTS === 'true',
  };
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function safePasswordEqual(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function requiredSecret(value: string | undefined, name: string, minimumLength: number): string {
  if (!value || value.length < minimumLength) throw new Error(`${name} must contain at least ${minimumLength} characters`);
  return value;
}

function requiredPattern(value: string | undefined, name: string, pattern: RegExp): string {
  if (!value || !pattern.test(value)) throw new Error(`${name} is invalid`);
  return value;
}
