# 社内タスク管理ツール 開発計画

## 1. 目的と前提

- 自社内で使う汎用タスク管理ツール（プロジェクト / タスク / カンバン / 担当者 / 期限 / タグ / コメント）。
- **社外へのデータ送信は一切行わない**。インターネットへのアップロードが物理的に起きない設計にする。
- 社内 LAN 上の 1 台（または各自の PC）で起動し、ブラウザから使う。

## 2. 「アップロードしない」を保証する設計方針

| 項目 | 方針 |
| --- | --- |
| データ保存 | ローカルの SQLite ファイル 1 個（`data/tasks.db`）。クラウド DB・外部ストレージは使わない |
| 外部通信 | サーバー・クライアントとも外部 API / CDN / フォント / アナリティクス / テレメトリを一切参照しない |
| 依存パッケージ | Node.js 標準の `node:sqlite` を使い、ネイティブビルドや実行時ダウンロードを不要にする |
| 配信 | フロントエンドはビルド済み静的ファイルをローカルサーバーが同梱配信（CDN 不使用） |
| ブラウザ側の縛り | `Content-Security-Policy: default-src 'self'` を付与し、万一外部 URL が混入してもブラウザが遮断 |
| 待受アドレス | 既定は `127.0.0.1`（自分の PC のみ）。LAN 共有時のみ `HOST=0.0.0.0` を明示 |
| 検証 | `npm run check:offline` でビルド成果物とサーバーコードに外部 URL が無いことを機械的に確認 |
| バックアップ | SQLite ファイルのコピー、または `GET /api/export` の JSON をローカルに保存 |

## 3. 技術スタック

- **サーバー**: Node.js 22 / TypeScript / Express 5 / `node:sqlite`（内蔵）
- **クライアント**: Vite / React 19 / TypeScript / 素の CSS（外部 UI ライブラリ・Web フォント不使用）
- **構成**: npm workspaces（`server`, `client`, `shared`）
- **テスト**: `node:test`（API）、`tsc` 型検査、Playwright によるスモーク確認

## 4. 機能スコープ（MVP）

1. プロジェクト管理（作成・編集・アーカイブ、色）
2. タスク CRUD（タイトル / 説明 / ステータス / 優先度 / 担当者 / 期限 / タグ / 並び順）
3. ビュー: リスト（ソート・フィルタ・検索）、カンバン（ドラッグ&ドロップで列間移動と並べ替え）
4. タスク詳細（編集・コメント・完了）
5. メンバー管理（名前のみ。ログイン無し。LAN 内の信頼前提）
6. タグ管理
7. ダッシュボード（自分の担当 / 期限超過 / 今週期限）
8. エクスポート / インポート（JSON）
9. 日本語 UI

将来候補（今回は実装しない）: 認証・権限、添付ファイル、通知、繰り返しタスク、変更履歴。

## 5. API 契約（`/api`, JSON）

型定義は `shared/types.ts` を正とする。

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true, version }` |
| GET/POST | `/api/members` | 一覧 / 作成 `{ name }` |
| PATCH/DELETE | `/api/members/:id` | 更新 `{ name?, active? }` / 削除（担当タスクは担当なしに） |
| GET/POST | `/api/projects` | 一覧（`?includeArchived=1`）/ 作成 `{ name, description?, color? }` |
| PATCH/DELETE | `/api/projects/:id` | 更新 `{ name?, description?, color?, archived? }` / 削除（配下タスクごと） |
| GET/POST | `/api/tags` | 一覧 / 作成 `{ name, color? }` |
| PATCH/DELETE | `/api/tags/:id` | 更新 / 削除 |
| GET | `/api/tasks` | 一覧。クエリ: `projectId, status, assigneeId, tagId, priority, q, dueBefore, dueAfter, includeDone` |
| POST | `/api/tasks` | 作成 `{ projectId, title, description?, status?, priority?, assigneeId?, dueDate?, tagIds? }` |
| GET | `/api/tasks/:id` | 詳細（`comments` 付き） |
| PATCH | `/api/tasks/:id` | 部分更新（`tagIds` 含む） |
| DELETE | `/api/tasks/:id` | 削除 |
| POST | `/api/tasks/reorder` | `{ items: [{ id, status, position }] }` カンバン並べ替え |
| POST | `/api/tasks/:id/comments` | `{ body, authorId? }` |
| DELETE | `/api/comments/:id` | コメント削除 |
| GET | `/api/export` | 全データ JSON |
| POST | `/api/import` | JSON を取り込み（`{ mode: 'replace' | 'merge' }`） |

エラーは `{ error: { code, message } }` と適切な HTTP ステータス。

## 6. データモデル（SQLite）

- `members(id, name, active, created_at)`
- `projects(id, name, description, color, archived, created_at, updated_at)`
- `tags(id, name UNIQUE, color)`
- `tasks(id, project_id FK, title, description, status, priority, assignee_id FK NULL, due_date, position, created_at, updated_at, completed_at)`
- `task_tags(task_id, tag_id)`
- `comments(id, task_id FK, author_id FK NULL, body, created_at)`
- `schema_migrations(version)`

## 7. 進め方

1. 骨格（ワークスペース・共有型・計画書）をコミット ← このドキュメント
2. サーバーとクライアントを **並列** で実装（API 契約を共有）
3. 結合・E2E スモーク・オフライン検査・README 整備
4. 動作確認（起動 → ブラウザ操作 → スクリーンショット）

## 8. 起動方法（完成時）

```bash
npm install
npm run build
npm start            # http://127.0.0.1:3000
HOST=0.0.0.0 npm start   # LAN 共有時
```
