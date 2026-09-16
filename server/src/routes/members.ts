// /api/members
import { Router } from 'express';
import type { Db } from '../db.js';
import { notFoundError } from '../errors.js';
import { rowExists } from '../repo.js';
import { nowIso, sqlBool, toMember } from '../rows.js';
import type { Row } from '../rows.js';
import { asObject, has, parseIdParam, requireBoolean, requireName } from '../validate.js';

export function membersRouter(db: Db): Router {
  const router = Router();

  router.get('/members', (_req, res) => {
    const rows = db.prepare('SELECT * FROM members ORDER BY id').all() as Row[];
    res.json(rows.map(toMember));
  });

  router.post('/members', (req, res) => {
    const body = asObject(req.body);
    const name = requireName(body['name'], 'name');
    const createdAt = nowIso();
    const info = db
      .prepare('INSERT INTO members (name, active, created_at) VALUES (?, 1, ?)')
      .run(name, createdAt);
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(info.lastInsertRowid)) as Row;
    res.status(201).json(toMember(row));
  });

  router.patch('/members/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'member id');
    const body = asObject(req.body);
    if (!rowExists(db, 'members', id)) throw notFoundError(`メンバー id=${id} が見つかりません`);

    if (has(body, 'name')) {
      db.prepare('UPDATE members SET name = ? WHERE id = ?').run(requireName(body['name'], 'name'), id);
    }
    if (has(body, 'active')) {
      db.prepare('UPDATE members SET active = ? WHERE id = ?').run(
        sqlBool(requireBoolean(body['active'], 'active')),
        id,
      );
    }
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as Row;
    res.json(toMember(row));
  });

  router.delete('/members/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'member id');
    // assignee_id / author_id は ON DELETE SET NULL で担当なしになる
    const info = db.prepare('DELETE FROM members WHERE id = ?').run(id);
    if (Number(info.changes) === 0) throw notFoundError(`メンバー id=${id} が見つかりません`);
    res.status(204).end();
  });

  return router;
}
