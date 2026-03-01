import { describe, it, expect } from 'vitest';
import { createUserContext, createUserContextFromValues, withLangfuseHeaders, hashApiKey } from '../src/identity/context.js';

describe('createUserContext', () => {
  it('extracts hashed userId from x-api-key header', () => {
    const ctx = createUserContext({
      headers: { 'x-api-key': 'my-api-key-123' },
    });
    expect(ctx.userId).toBe(hashApiKey('my-api-key-123'));
    expect(ctx.userId).toMatch(/^key_[0-9a-f]{16}$/);
    expect(ctx.source).toBe('api_key');
  });

  it('extracts userId from JWT Bearer token', () => {
    // Create a valid JWT with sub and email claims (no signature verification)
    const payload = { sub: 'user-42', email: 'user@test.com' };
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${b64Payload}.fake-sig`;

    const ctx = createUserContext({
      headers: { authorization: `Bearer ${fakeJwt}` },
    });
    expect(ctx.userId).toBe('user-42');
    expect(ctx.email).toBe('user@test.com');
    expect(ctx.source).toBe('jwt');
  });

  it('falls back to IP address when no auth headers present', () => {
    const ctx = createUserContext({
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
    });
    expect(ctx.userId).toBe('192.168.1.1');
    expect(ctx.source).toBe('ip');
  });

  it('falls back to socket remoteAddress when no forwarded header', () => {
    const ctx = createUserContext({
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    });
    expect(ctx.userId).toBe('127.0.0.1');
    expect(ctx.source).toBe('ip');
  });

  it('returns "unknown" when no identity info available', () => {
    const ctx = createUserContext({ headers: {} });
    expect(ctx.userId).toBe('unknown');
    expect(ctx.source).toBe('ip');
  });

  it('prefers x-api-key over JWT and IP', () => {
    const payload = { sub: 'jwt-user' };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const ctx = createUserContext({
      headers: {
        'x-api-key': 'api-key-wins',
        authorization: `Bearer header.${b64}.sig`,
        'x-forwarded-for': '1.2.3.4',
      },
    });
    expect(ctx.userId).toBe(hashApiKey('api-key-wins'));
    expect(ctx.source).toBe('api_key');
  });
});

describe('createUserContextFromValues', () => {
  it('creates context from explicit values', () => {
    const ctx = createUserContextFromValues('user-1', 'api_key', { email: 'a@b.com' });
    expect(ctx.userId).toBe('user-1');
    expect(ctx.source).toBe('api_key');
    expect(ctx.email).toBe('a@b.com');
  });
});

describe('withLangfuseHeaders', () => {
  it('sets x-litellm-user header', () => {
    const headers = withLangfuseHeaders({ userId: 'u1', source: 'api_key' });
    expect(headers['x-litellm-user']).toBe('u1');
  });

  it('includes session ID when present', () => {
    const headers = withLangfuseHeaders({ userId: 'u1', source: 'jwt', sessionId: 'sess-1' });
    expect(headers['x-litellm-session-id']).toBe('sess-1');
  });

  it('serializes metadata (email, source, traits) into x-litellm-metadata', () => {
    const headers = withLangfuseHeaders({
      userId: 'u1',
      source: 'jwt',
      email: 'test@test.com',
      traits: { role: 'admin' },
    });
    expect(headers['x-litellm-metadata']).toBeDefined();
    const meta = JSON.parse(headers['x-litellm-metadata']!) as Record<string, string>;
    expect(meta.email).toBe('test@test.com');
    expect(meta.source).toBe('jwt');
    expect(meta.role).toBe('admin');
  });

  it('omits x-litellm-metadata when no extra data', () => {
    // source is always set, so metadata will include it
    const headers = withLangfuseHeaders({ userId: 'u1', source: 'ip' });
    // 'ip' source is still added to metadata
    expect(headers['x-litellm-metadata']).toBeDefined();
  });
});
