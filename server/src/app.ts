// Express アプリの組み立て。listen はしない（テストから再利用するため）。
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';
import { HttpError } from './errors.js';
import { commentsRouter } from './routes/comments.js';
import { membersRouter } from './routes/members.js';
import { projectsRouter } from './routes/projects.js';
import { tagsRouter } from './routes/tags.js';
import { tasksRouter } from './routes/tasks.js';
import { transferRouter } from './routes/transfer.js';

export const APP_VERSION = '0.1.0';

const BUILD_HINT = 'クライアントが未ビルドです。npm run build を実行してから再度アクセスしてください。\n';

export interface AppOptions {
  /** ビルド済みクライアント（client/dist）のパス。存在しない場合は案内文を返す。 */
  clientDist?: string | undefined;
}

/** 外部リソースを読み込ませないためのヘッダー。全レスポンスに付与する。 */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
  );
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  const parseError = error as BodyParserError;
  if (parseError?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'リクエストが大きすぎます（上限 5mb）' } });
    return;
  }
  if (parseError?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'validation', message: 'JSON の解析に失敗しました' } });
    return;
  }
  // スタックトレースはレスポンスに含めない（stdout/stderr のみ）
  console.error('[error]', error instanceof Error ? error.stack ?? error.message : String(error));
  res.status(500).json({ error: { code: 'internal', message: 'サーバー内部エラーが発生しました' } });
}

export function createApp(db: Db, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(securityHeaders);
  app.use(express.json({ limit: '5mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, version: APP_VERSION });
  });
  api.use(membersRouter(db));
  api.use(projectsRouter(db));
  api.use(tagsRouter(db));
  api.use(tasksRouter(db));
  api.use(commentsRouter(db));
  api.use(transferRouter(db));
  app.use('/api', api);

  // 未知の /api/* は JSON で 404
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: `${req.method} /api${req.path} は存在しません` } });
  });

  const clientDist = options.clientDist;
  const hasClient = typeof clientDist === 'string' && existsSync(path.join(clientDist, 'index.html'));
  if (hasClient && clientDist) {
    app.use(express.static(clientDist, { index: 'index.html', maxAge: 0 }));
    // SPA フォールバック: /api 以外の GET は index.html を返す
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('text/plain; charset=utf-8').send(BUILD_HINT);
    });
  }

  app.use((_req, res) => {
    res.status(404).type('text/plain; charset=utf-8').send('見つかりません\n');
  });
  app.use(errorHandler);

  return app;
}
