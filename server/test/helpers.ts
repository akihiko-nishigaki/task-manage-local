// テスト用: メモリ DB の上にアプリを立て、実際に HTTP でアクセスする。
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import type { Db } from '../src/db.js';

export interface ApiResponse {
  status: number;
  headers: Headers;
  // テストの記述性を優先して any を許容する
  data: any;
}

export interface TestContext {
  url: string;
  db: Db;
  close: () => Promise<void>;
  request: (method: string, path: string, body?: unknown) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
  post: (path: string, body?: unknown) => Promise<ApiResponse>;
  patch: (path: string, body?: unknown) => Promise<ApiResponse>;
  del: (path: string) => Promise<ApiResponse>;
}

export async function createContext(): Promise<TestContext> {
  const db = createDb(':memory:');
  const app = createApp(db);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const url = `//127.0.0.1:${port}`;

  const request = async (method: string, path: string, body?: unknown): Promise<ApiResponse> => {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`http:${url}${path}`, init);
    const text = await res.text();
    let data: unknown = null;
    if (text !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, headers: res.headers, data };
  };

  return {
    url,
    db,
    close: async () => {
      server.close();
      await once(server, 'close');
      db.close();
    },
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
  };
}

/** よく使う下準備（メンバー・プロジェクト・タグ） */
export async function seed(ctx: TestContext): Promise<{ memberId: number; projectId: number; tagId: number }> {
  const member = await ctx.post('/api/members', { name: '西垣' });
  const project = await ctx.post('/api/projects', { name: '社内ツール', color: '#123456' });
  const tag = await ctx.post('/api/tags', { name: 'バグ' });
  return { memberId: member.data.id, projectId: project.data.id, tagId: tag.data.id };
}
