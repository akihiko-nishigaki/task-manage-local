// SQLite（Node 組み込みの node:sqlite）の初期化とマイグレーション。
// 外部プロセス・ネイティブビルド・ネットワークアクセスは一切発生しない。
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

interface Migration {
  version: number;
  sql: string;
  /** テーブル作り直しなど、外部キー制約を一時的に切って実行する必要があるもの */
  withoutForeignKeys?: boolean;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#4f46e5',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#64748b'
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo'
          CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        due_date TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS task_tags (
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
    `,
  },
  {
    // 完了タスクのアーカイブ（一覧から隠すだけで削除はしない）
    version: 2,
    sql: `
      ALTER TABLE tasks ADD COLUMN archived_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);
    `,
  },
  {
    // やり取りしているチャネル（メール / Teams / 口頭）と、関連先へのリンク
    version: 3,
    sql: `
      ALTER TABLE tasks ADD COLUMN channel TEXT;
      ALTER TABLE tasks ADD COLUMN link TEXT;
      CREATE INDEX IF NOT EXISTS idx_tasks_channel ON tasks(channel);
    `,
  },
  {
    // ステータスに 'backlog'（プロダクトバックログ）を追加。
    // SQLite は CHECK 制約を ALTER できないので tasks を作り直す。
    // 子テーブル（task_tags / comments）の ON DELETE CASCADE を発火させないため、外部キーを切って行う。
    version: 4,
    withoutForeignKeys: true,
    sql: `
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo'
          CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        due_date TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        archived_at TEXT,
        channel TEXT,
        link TEXT
      );
      INSERT INTO tasks_new (id, project_id, title, description, status, priority, assignee_id, due_date,
                             position, created_at, updated_at, completed_at, archived_at, channel, link)
        SELECT id, project_id, title, description, status, priority, assignee_id, due_date,
               position, created_at, updated_at, completed_at, archived_at, channel, link
        FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX idx_tasks_status ON tasks(status);
      CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
      CREATE INDEX idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX idx_tasks_archived_at ON tasks(archived_at);
      CREATE INDEX idx_tasks_channel ON tasks(channel);
    `,
  },
];

/** このアプリが扱えるスキーマの最新版。 */
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

function appliedVersions(db: Db): Set<number> {
  return new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row['version'])),
  );
}

function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);
  const applied = appliedVersions(db);
  // 共有フォルダ運用では、更新済みの PC と未更新の PC が同じ DB を開くことがある。
  // 新しい版で作り直された DB を古いアプリが触ると壊しかねないので、起動を止めて更新を促す。
  const newest = Math.max(0, ...applied);
  if (newest > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `このデータは新しいバージョンのアプリで更新されています（データ v${newest} / このアプリは v${LATEST_SCHEMA_VERSION} まで対応）。` +
        'アプリを最新版に更新してから起動してください。',
    );
  }
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    // PRAGMA foreign_keys はトランザクション内では効かないので BEGIN の外で切り替える
    if (migration.withoutForeignKeys) db.exec('PRAGMA foreign_keys = OFF;');
    // 複数の PC が同時に起動しても、移行を実行できるのは 1 台だけにする
    db.exec('BEGIN IMMEDIATE');
    try {
      if (appliedVersions(db).has(migration.version)) {
        // 待っている間に別の PC が適用済み
        db.exec('COMMIT');
        continue;
      }
      db.exec(migration.sql);
      if (migration.withoutForeignKeys) {
        const violations = db.prepare('PRAGMA foreign_key_check').all();
        if (violations.length > 0) throw new Error(`マイグレーション ${migration.version} で外部キー違反が発生しました`);
      }
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      if (migration.withoutForeignKeys) db.exec('PRAGMA foreign_keys = ON;');
    }
  }
}

export interface CreateDbOptions {
  /**
   * 共有フォルダ / ファイルサーバー上の DB を複数の PC から直接開く運用。
   * WAL はネットワーク越しでは動かないので通常のジャーナル（DELETE）を使い、
   * ロック競合に備えて待ち時間を長く、書き込みは確実にディスクへ届くようにする。
   */
  shared?: boolean;
}

/** DB を開いてマイグレーションを適用する。テストでは ':memory:' を渡す。 */
export function createDb(location: string, options: CreateDbOptions = {}): Db {
  const db = new DatabaseSync(location);
  const shared = options.shared === true && location !== ':memory:';
  if (shared) {
    // 先に待ち時間を決めてからジャーナル方式を切り替える（他の PC が使用中でも待てるように）
    db.exec('PRAGMA busy_timeout = 15000;');
    db.exec('PRAGMA journal_mode = DELETE;');
    db.exec('PRAGMA synchronous = FULL;');
  } else {
    if (location !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
    // 複数人で同時に使うと書き込みがぶつかる。すぐ諦めず 5 秒待ってから失敗させる
    db.exec('PRAGMA busy_timeout = 5000;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/**
 * 1 トランザクションで実行する。例外時は ROLLBACK。
 * 最初から書き込みロックを取る（IMMEDIATE）。読んでから書く通常の BEGIN だと、複数の接続
 * （共有フォルダ運用では別の PC）が同時にロックを昇格しようとして、busy_timeout が効かずに
 * 即 "database is locked" になるため。
 */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ROLLBACK 自体の失敗は元の例外を優先する
    }
    throw error;
  }
}
