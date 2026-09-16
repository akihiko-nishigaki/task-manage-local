import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext } from './helpers.js';

test('GET /api/health は ok と version を返す', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const res = await ctx.get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(typeof res.data.version, 'string');
});

test('セキュリティヘッダーが全レスポンスに付与される', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  for (const path of ['/api/health', '/api/members', '/', '/api/unknown']) {
    const res = await ctx.get(path);
    assert.equal(
      res.headers.get('content-security-policy'),
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
      `CSP: ${path}`,
    );
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer', `Referrer-Policy: ${path}`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `nosniff: ${path}`);
    assert.equal(res.headers.get('x-powered-by'), null);
  }
});

test('未知の /api/* は JSON の 404 を返す', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const res = await ctx.get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.data.error.code, 'not_found');
});

test('client/dist が無い場合 / はビルド案内を返す', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const res = await ctx.get('/');
  assert.equal(res.status, 200);
  assert.match(String(res.data), /npm run build/);
});
