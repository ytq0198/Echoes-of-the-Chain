import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const app = buildApp();

afterEach(async () => {
  await app.ready();
});

describe('API bootstrap', () => {
  it('exposes a deterministic health response', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'chaingrade-api',
      version: '0.1.0',
    });
  });

  it('describes the single evolving product', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/meta' });
    expect(response.statusCode).toBe(200);
    expect(response.json().product).toBe('ChainGrade');
    expect(response.json().capabilities).toContain('appeal');
  });
});
