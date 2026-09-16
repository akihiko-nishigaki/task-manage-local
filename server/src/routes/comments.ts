// /api/tasks/:id/comments, /api/comments/:id
import { Router } from 'express';
import type { Db } from '../db.js';
import { notFoundError } from '../errors.js';
import { ensureMember, ensureTask } from '../repo.js';
import { nowIso, toComment } from '../rows.js';
import type { Row } from '../rows.js';
import { asObject, has, parseIdParam, requireNullableId, requireText } from '../validate.js';
import { validationError } from '../errors.js';

export function commentsRouter(db: Db): Router {
  const router = Router();

  router.post('/tasks/:id/comments', (req, res) => {
    const taskId = parseIdParam(req.params.id, 'task id');
    const body = asObject(req.body);
    ensureTask(db, taskId);
    const text = requireText(body['body'], 'body');
    if (text.trim() === '') throw validationError('body を入力してください');
    const authorId = has(body, 'authorId') ? requireNullableId(body['authorId'], 'authorId') : null;
    ensureMember(db, authorId);

    const info = db
      .prepare('INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(taskId, authorId, text, nowIso());
    const row = db
      .prepare(
        `SELECT c.*, m.name AS author_name
         FROM comments c LEFT JOIN members m ON m.id = c.author_id
         WHERE c.id = ?`,
      )
      .get(Number(info.lastInsertRowid)) as Row;
    res.status(201).json(toComment(row));
  });

  router.delete('/comments/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'comment id');
    const info = db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    if (Number(info.changes) === 0) throw notFoundError(`コメント id=${id} が見つかりません`);
    res.status(204).end();
  });

  return router;
}
