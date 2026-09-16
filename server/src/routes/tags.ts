// /api/tags
import { Router } from 'express';
import type { Db } from '../db.js';
import { conflictError, notFoundError } from '../errors.js';
import { isUniqueViolation, rowExists } from '../repo.js';
import { toTag } from '../rows.js';
import type { Row } from '../rows.js';
import { asObject, has, parseIdParam, requireColor, requireName } from '../validate.js';

const DEFAULT_COLOR = '#64748b';

export function tagsRouter(db: Db): Router {
  const router = Router();

  router.get('/tags', (_req, res) => {
    const rows = db.prepare('SELECT * FROM tags ORDER BY id').all() as Row[];
    res.json(rows.map(toTag));
  });

  router.post('/tags', (req, res) => {
    const body = asObject(req.body);
    const name = requireName(body['name'], 'name');
    const color = has(body, 'color') ? requireColor(body['color']) : DEFAULT_COLOR;
    let id: number;
    try {
      const info = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
      id = Number(info.lastInsertRowid);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflictError(`タグ名 ${name} は既に存在します`);
      throw error;
    }
    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Row;
    res.status(201).json(toTag(row));
  });

  router.patch('/tags/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'tag id');
    const body = asObject(req.body);
    if (!rowExists(db, 'tags', id)) throw notFoundError(`タグ id=${id} が見つかりません`);

    const sets: string[] = [];
    const params: string[] = [];
    if (has(body, 'name')) {
      sets.push('name = ?');
      params.push(requireName(body['name'], 'name'));
    }
    if (has(body, 'color')) {
      sets.push('color = ?');
      params.push(requireColor(body['color']));
    }
    if (sets.length > 0) {
      try {
        db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      } catch (error) {
        if (isUniqueViolation(error)) throw conflictError('同名のタグが既に存在します');
        throw error;
      }
    }
    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Row;
    res.json(toTag(row));
  });

  router.delete('/tags/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'tag id');
    // task_tags は ON DELETE CASCADE で削除される
    const info = db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    if (Number(info.changes) === 0) throw notFoundError(`タグ id=${id} が見つかりません`);
    res.status(204).end();
  });

  return router;
}
