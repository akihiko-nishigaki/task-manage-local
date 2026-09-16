// /api/projects
import { Router } from 'express';
import type { Db } from '../db.js';
import { notFoundError } from '../errors.js';
import { rowExists } from '../repo.js';
import { nowIso, sqlBool, toProject } from '../rows.js';
import type { Row } from '../rows.js';
import {
  asObject,
  has,
  parseIdParam,
  queryBoolean,
  requireBoolean,
  requireColor,
  requireName,
  requireText,
} from '../validate.js';

const DEFAULT_COLOR = '#4f46e5';

const LIST_SQL = `
  SELECT p.*,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS open_task_count
  FROM projects p
`;

export function projectsRouter(db: Db): Router {
  const router = Router();

  router.get('/projects', (req, res) => {
    const includeArchived = queryBoolean(req.query['includeArchived'], false);
    const sql = `${LIST_SQL} ${includeArchived ? '' : 'WHERE p.archived = 0'} ORDER BY p.archived, p.id`;
    const rows = db.prepare(sql).all() as Row[];
    res.json(rows.map((row) => toProject(row, true)));
  });

  router.post('/projects', (req, res) => {
    const body = asObject(req.body);
    const name = requireName(body['name'], 'name');
    const description = has(body, 'description') ? requireText(body['description'], 'description') : '';
    const color = has(body, 'color') ? requireColor(body['color']) : DEFAULT_COLOR;
    const now = nowIso();
    const info = db
      .prepare(
        `INSERT INTO projects (name, description, color, archived, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
      )
      .run(name, description, color, now, now);
    const row = db
      .prepare(`${LIST_SQL} WHERE p.id = ?`)
      .get(Number(info.lastInsertRowid)) as Row;
    res.status(201).json(toProject(row, true));
  });

  router.patch('/projects/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'project id');
    const body = asObject(req.body);
    if (!rowExists(db, 'projects', id)) throw notFoundError(`プロジェクト id=${id} が見つかりません`);

    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (has(body, 'name')) {
      sets.push('name = ?');
      params.push(requireName(body['name'], 'name'));
    }
    if (has(body, 'description')) {
      sets.push('description = ?');
      params.push(requireText(body['description'], 'description'));
    }
    if (has(body, 'color')) {
      sets.push('color = ?');
      params.push(requireColor(body['color']));
    }
    if (has(body, 'archived')) {
      sets.push('archived = ?');
      params.push(sqlBool(requireBoolean(body['archived'], 'archived')));
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(nowIso());
      db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    }
    const row = db.prepare(`${LIST_SQL} WHERE p.id = ?`).get(id) as Row;
    res.json(toProject(row, true));
  });

  router.delete('/projects/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'project id');
    // 配下の tasks / task_tags / comments は ON DELETE CASCADE で削除される
    const info = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    if (Number(info.changes) === 0) throw notFoundError(`プロジェクト id=${id} が見つかりません`);
    res.status(204).end();
  });

  return router;
}
