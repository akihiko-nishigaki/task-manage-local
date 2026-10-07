import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createServerApp } from '../src/serverApp.js';
import { WorkspaceManager, openWorkspaceDb } from '../src/workspaces.js';

interface Ctx {
  dir: string;
  configFile: string;
  manager: WorkspaceManager;
  request: (method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; data: any }>;
}

async function setup(t: test.TestContext, options: { allowManage?: boolean } = {}): Promise<Ctx> {
  const dir = mkdtempSync(path.join(tmpdir(), 'tm-ws-'));
  const primaryDir = path.join(dir, 'primary');
  const primaryDb = openWorkspaceDb(primaryDir, false);
  const configFile = path.join(dir, 'workspaces.json');
  const manager = new WorkspaceManager({
    primary: { dataDir: primaryDir, shared: false, db: primaryDb },
    configFile,
    autoDir: path.join(dir, 'auto'),
  });
  const app = createServerApp(manager, { allowManage: options.allowManage ?? true });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  t.after(async () => {
    server.close();
    await once(server, 'close');
    manager.closeAll();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows でファイルロックが残っても、一時ディレクトリなのでテスト結果には影響させない
    }
  });
  const request: Ctx['request'] = async (method, url, body, headers = {}) => {
    const init: RequestInit = { method, headers: { ...headers } };
    if (body !== undefined) {
      init.headers = { ...headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`http://127.0.0.1:${port}${url}`, init);
    const text = await res.text();
    let data: unknown = null;
    if (text !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, data };
  };
  return { dir, configFile, manager, request };
}

test('一覧には最初のデータだけが入っていて、ヘッダー無しの API はそれを使う', async (t) => {
  const ctx = await setup(t);
  const res = await ctx.request('GET', '/api/workspaces');
  assert.equal(res.status, 200);
  assert.equal(res.data.canManage, true);
  assert.equal(res.data.workspaces.length, 1);
  assert.equal(res.data.workspaces[0].id, 'main');
  assert.equal(res.data.workspaces[0].primary, true);
  assert.equal(res.data.workspaces[0].name, 'マイデータ');
  const health = await ctx.request('GET', '/api/health');
  assert.equal(health.data.ok, true);
});

test('追加したデータは、最初のデータと中身が完全に分かれる', async (t) => {
  const ctx = await setup(t);
  const created = await ctx.request('POST', '/api/workspaces', { name: '個人' });
  assert.equal(created.status, 201);
  assert.equal(created.data.mode, 'local');
  assert.ok(existsSync(path.join(created.data.dataDir, 'tasks.db')), '保存場所に DB ができる');
  assert.ok(created.data.dataDir.startsWith(path.join(ctx.dir, 'auto')), '省略時は自動の場所');

  const h = { 'x-workspace': created.data.id };
  await ctx.request('POST', '/api/projects', { name: '個人のプロジェクト' }, h);
  const mine = await ctx.request('GET', '/api/projects', undefined, h);
  const main = await ctx.request('GET', '/api/projects');
  assert.deepEqual(mine.data.map((p: { name: string }) => p.name), ['個人のプロジェクト']);
  assert.deepEqual(main.data, []);
});

test('追加したデータの一覧は設定ファイルに保存され、再起動しても残る', async (t) => {
  const ctx = await setup(t);
  const created = await ctx.request('POST', '/api/workspaces', { name: '個人' });
  await ctx.request('POST', '/api/projects', { name: 'P' }, { 'x-workspace': created.data.id });
  ctx.manager.closeAll();

  const primaryDir = path.join(ctx.dir, 'primary');
  const again = new WorkspaceManager({
    primary: { dataDir: primaryDir, shared: false, db: openWorkspaceDb(primaryDir, false) },
    configFile: ctx.configFile,
    autoDir: path.join(ctx.dir, 'auto'),
  });
  t.after(() => again.closeAll());
  assert.deepEqual(again.list().map((w) => w.name), ['マイデータ', '個人']);
  // 初めて使うときに開き、前のデータが残っている
  const db = again.get(created.data.id).db;
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM projects').get()?.['n']), 1);
});

test('名前・保存場所の重複や、相対パスは追加できない', async (t) => {
  const ctx = await setup(t);
  const a = await ctx.request('POST', '/api/workspaces', { name: '個人' });
  assert.equal(a.status, 201);

  const sameName = await ctx.request('POST', '/api/workspaces', { name: '個人' });
  assert.equal(sameName.status, 400);
  const sameNameCase = await ctx.request('POST', '/api/workspaces', { name: 'マイデータ' });
  assert.equal(sameNameCase.status, 400, '最初のデータの名前とも重複させない');

  const sameDir = await ctx.request('POST', '/api/workspaces', { name: '別名', dataDir: a.data.dataDir });
  assert.equal(sameDir.status, 400);
  const relative = await ctx.request('POST', '/api/workspaces', { name: '相対', dataDir: 'data/relative' });
  assert.equal(relative.status, 400);
  const empty = await ctx.request('POST', '/api/workspaces', { name: '   ' });
  assert.equal(empty.status, 400);
});

test('指定した保存場所（共有フォルダ想定）で追加でき、共有モードを指定すると共有扱いになる', async (t) => {
  const ctx = await setup(t);
  const dir = path.join(ctx.dir, 'fileserver', 'task');
  const created = await ctx.request('POST', '/api/workspaces', { name: '共有', dataDir: dir, shared: true });
  assert.equal(created.status, 201);
  assert.equal(created.data.mode, 'shared');
  assert.equal(created.data.dataDir, path.resolve(dir));
  const health = await ctx.request('GET', '/api/health', undefined, { 'x-workspace': created.data.id });
  assert.equal(health.data.mode, 'shared');
  // 共有モードでは自動バックアップができる
  assert.ok(existsSync(path.join(dir, 'backups')));
});

test('このアプリのものではない tasks.db が置かれた場所は、追加を断る', async (t) => {
  const ctx = await setup(t);
  const dir = path.join(ctx.dir, 'foreign');
  mkdirSync(dir, { recursive: true });
  const other = new DatabaseSync(path.join(dir, 'tasks.db'));
  other.exec('CREATE TABLE something_else (id INTEGER)');
  other.close();
  const res = await ctx.request('POST', '/api/workspaces', { name: '別のDB', dataDir: dir });
  assert.equal(res.status, 400);
  assert.match(res.data.error.message, /このアプリのデータではありません/);
  assert.equal((await ctx.request('GET', '/api/workspaces')).data.workspaces.length, 1);
});

test('名前変更: 追加したデータも最初のデータも変えられ、最初のデータの名前は再起動後も残る', async (t) => {
  const ctx = await setup(t);
  const a = await ctx.request('POST', '/api/workspaces', { name: '個人' });
  const renamed = await ctx.request('PATCH', `/api/workspaces/${a.data.id}`, { name: 'プライベート' });
  assert.equal(renamed.data.name, 'プライベート');
  const primary = await ctx.request('PATCH', '/api/workspaces/main', { name: '共有フォルダ' });
  assert.equal(primary.data.name, '共有フォルダ');
  ctx.manager.closeAll();

  const primaryDir = path.join(ctx.dir, 'primary');
  const again = new WorkspaceManager({
    primary: { dataDir: primaryDir, shared: false, db: openWorkspaceDb(primaryDir, false) },
    configFile: ctx.configFile,
    autoDir: path.join(ctx.dir, 'auto'),
  });
  t.after(() => again.closeAll());
  assert.deepEqual(again.list().map((w) => w.name), ['共有フォルダ', 'プライベート']);
});

test('一覧から外してもデータのファイルは消えない。最初のデータは外せない', async (t) => {
  const ctx = await setup(t);
  const a = await ctx.request('POST', '/api/workspaces', { name: '個人' });
  await ctx.request('POST', '/api/projects', { name: '残るデータ' }, { 'x-workspace': a.data.id });
  const del = await ctx.request('DELETE', `/api/workspaces/${a.data.id}`);
  assert.equal(del.status, 204);
  assert.ok(existsSync(path.join(a.data.dataDir, 'tasks.db')), 'データは残る');
  assert.equal((await ctx.request('GET', '/api/workspaces')).data.workspaces.length, 1);
  const gone = await ctx.request('GET', '/api/projects', undefined, { 'x-workspace': a.data.id });
  assert.equal(gone.status, 404);

  assert.equal((await ctx.request('DELETE', '/api/workspaces/main')).status, 400);
  assert.equal((await ctx.request('DELETE', '/api/workspaces/wdeadbeef')).status, 404);
});

test('共有サーバー（LAN へ公開）では、データの追加・変更・削除は断り、一覧だけ返す', async (t) => {
  const ctx = await setup(t, { allowManage: false });
  const list = await ctx.request('GET', '/api/workspaces');
  assert.equal(list.status, 200);
  assert.equal(list.data.canManage, false);
  assert.equal((await ctx.request('POST', '/api/workspaces', { name: 'x' })).status, 403);
  assert.equal((await ctx.request('PATCH', '/api/workspaces/main', { name: 'x' })).status, 403);
  assert.equal((await ctx.request('DELETE', '/api/workspaces/main')).status, 403);
});

test('ほかのサイトのページ（Origin が違う）からの書き込みは断る', async (t) => {
  const ctx = await setup(t);
  const res = await ctx.request('POST', '/api/workspaces', { name: '悪意' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal((await ctx.request('GET', '/api/workspaces')).data.workspaces.length, 1);
});

test('未登録の id は 404、開けない保存場所は 503 で理由を返し、ほかのデータは使える', async (t) => {
  const ctx = await setup(t);
  assert.equal((await ctx.request('GET', '/api/projects', undefined, { 'x-workspace': 'nope' })).status, 404);

  // ファイルの下をデータ置き場として設定ファイルに書く（開けない）
  const blocker = path.join(ctx.dir, 'blocker');
  writeFileSync(blocker, 'x');
  ctx.manager.closeAll();
  writeFileSync(
    ctx.configFile,
    JSON.stringify({ workspaces: [{ id: 'w0badbad0', name: '壊れた場所', dataDir: path.join(blocker, 'sub') }] }),
  );
  const primaryDir = path.join(ctx.dir, 'primary');
  const again = new WorkspaceManager({
    primary: { dataDir: primaryDir, shared: false, db: openWorkspaceDb(primaryDir, false) },
    configFile: ctx.configFile,
    autoDir: path.join(ctx.dir, 'auto'),
  });
  t.after(() => again.closeAll());
  assert.deepEqual(again.list().map((w) => w.name), ['マイデータ', '壊れた場所']);
  assert.throws(
    () => again.get('w0badbad0'),
    (error: { status?: number; code?: string; message?: string }) =>
      error.status === 503 && error.code === 'workspace_unavailable' && /壊れた場所/.test(String(error.message)),
  );
  // 開けないデータがあっても、最初のデータは普通に使える
  assert.equal(again.get(undefined).info.id, 'main');
});

test('形式の違う id の設定は読み飛ばし、設定ファイルが壊れていても起動できる', async (t) => {
  const ctx = await setup(t);
  ctx.manager.closeAll();
  const primaryDir = path.join(ctx.dir, 'primary');
  const make = (): WorkspaceManager =>
    new WorkspaceManager({
      primary: { dataDir: primaryDir, shared: false, db: openWorkspaceDb(primaryDir, false) },
      configFile: ctx.configFile,
      autoDir: path.join(ctx.dir, 'auto'),
    });

  writeFileSync(ctx.configFile, JSON.stringify({ workspaces: [{ id: '../evil', name: 'x', dataDir: ctx.dir }] }));
  const a = make();
  assert.deepEqual(a.list().map((w) => w.name), ['マイデータ']);
  a.closeAll();

  writeFileSync(ctx.configFile, '{ これは JSON ではありません');
  const b = make();
  t.after(() => b.closeAll());
  assert.deepEqual(b.list().map((w) => w.name), ['マイデータ']);
});
