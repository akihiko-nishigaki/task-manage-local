// サーバー全体のアプリ。複数のデータ（ワークスペース）への振り分けと、その管理 API を持つ。
// 各データの API 本体は app.ts の createApp()（これまでと同じ）で、ここはその外側にかぶせる層。
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { mountClient, securityHeaders } from './app.js';
import { HttpError, validationError } from './errors.js';
import { asObject, has } from './validate.js';
import { WORKSPACE_HEADER, WorkspaceManager } from './workspaces.js';

export interface ServerAppOptions {
  clientDist?: string | undefined;
  /**
   * データの追加・名前変更・削除を許すか。この PC の中だけで使っているとき（127.0.0.1 待ち受け）に限る。
   * LAN へ公開している共有サーバーでは、ほかの人が保存場所を指定できてしまうので許さない。
   */
  allowManage: boolean;
}

/** ほかのサイトのページから、この PC のサーバーを操作されないようにする（書き込み系のみ） */
function sameOriginOnly(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== '') {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      host = '';
    }
    if (host !== req.headers.host) {
      next(new HttpError(403, 'forbidden', '別のサイトからは操作できません'));
      return;
    }
  }
  next();
}

export function createServerApp(manager: WorkspaceManager, options: ServerAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(securityHeaders);

  // データの管理 API（一覧・追加・名前変更・一覧から外す）
  const ws = express.Router();
  ws.use(express.json({ limit: '100kb' }));
  ws.use(sameOriginOnly);
  const requireManage = (): void => {
    if (!options.allowManage) {
      throw new HttpError(403, 'forbidden', 'この共有サーバーでは、データの追加・変更はできません');
    }
  };
  ws.get('/', (_req, res) => {
    res.json({ workspaces: manager.list(), canManage: options.allowManage });
  });
  ws.post('/', (req, res) => {
    requireManage();
    const body = asObject(req.body);
    const created = manager.add({
      name: body['name'],
      ...(has(body, 'dataDir') ? { dataDir: body['dataDir'] } : {}),
      ...(has(body, 'shared') ? { shared: body['shared'] } : {}),
    });
    res.status(201).json(created);
  });
  ws.patch('/:id', (req, res) => {
    requireManage();
    const body = asObject(req.body);
    if (!has(body, 'name')) throw validationError('name を指定してください');
    res.json(manager.rename(String(req.params['id']), body['name']));
  });
  ws.delete('/:id', (req, res) => {
    requireManage();
    manager.remove(String(req.params['id']));
    res.status(204).end();
  });
  app.use('/api/workspaces', ws);

  // それ以外の /api/* は、X-Workspace ヘッダーで選ばれたデータ（無ければ最初のデータ）へ渡す
  app.use('/api', (req, res, next) => {
    let target;
    try {
      target = manager.get(req.header(WORKSPACE_HEADER));
    } catch (error) {
      next(error);
      return;
    }
    // マウント位置で削られた /api を元に戻して、各データのアプリにそのまま渡す
    req.url = req.originalUrl;
    target.app(req, res, next);
  });

  // 画面ファイルの配信と、エラー処理（上の振り分けで出た例外もここで JSON になる）
  mountClient(app, options.clientDist);
  return app;
}
