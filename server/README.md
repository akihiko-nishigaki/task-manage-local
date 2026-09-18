# @taskmanage/server

社内タスク管理ツールのローカル API サーバー。Express 5 + Node 標準の `node:sqlite` のみで動作し、
**外部ネットワークへのアクセスは一切行わない**（外部 API / CDN / テレメトリなし）。

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 待受アドレス。LAN 内で共有する場合のみ `0.0.0.0` を指定する |
| `PORT` | `3000` | 待受ポート |
| `DATA_DIR` | `<リポジトリ>/data` | SQLite ファイル `tasks.db` を置くディレクトリ（無ければ自動作成）。相対パスはカレントディレクトリ基準 |

DB は WAL モード・外部キー制約 ON で開く。バックアップは `data/tasks.db*` のコピー、
または `GET /api/export` の JSON をローカル保存する。

## スクリプト

```bash
npm run dev -w server        # tsx watch で開発起動
npm run build -w server      # dist/ へコンパイル（入口は dist/index.js）
npm start -w server          # ビルド済みサーバーを起動
npm run test -w server       # node:test による API テスト（メモリ DB）
npm run typecheck -w server  # 型検査のみ
```

`npm start` は起動時に URL を 1 行だけ標準出力へ出す。リクエスト内容のログは出さない。

## 配信

`client/dist` が存在すればそれを静的配信し、`/api` 以外の GET は `index.html` を返す（SPA フォールバック）。
未ビルドの場合 `/` は「`npm run build` を実行してください」という案内文を返す。

全レスポンスに以下を付与する。

- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`

## API

エンドポイントは `docs/PLAN.md` §5、レスポンスの型は `shared/types.ts` を正とする。補足:

- 作成は `201`、削除は `204`（本文なし）。エラーは `{ error: { code, message } }`。
  `code` は `validation`（400）/ `not_found`（404）/ `conflict`（409、タグ名重複）/
  `payload_too_large`（413）/ `internal`（500）。
- `GET /api/tasks` の並び順はステータス（未着手→進行中→レビュー→完了）→ `position` → `id`。
  `q` はタイトルと説明の部分一致（大文字小文字を区別しない）。`includeDone` は既定 `true` で、
  `0` / `false` のときだけ完了タスクを除外する。`dueBefore` / `dueAfter` は境界を含む。
  アーカイブ済み（`archivedAt` が非 null）は既定で除外し、`includeArchived=1` で含める、
  `archivedOnly=1` でアーカイブ済みのみ返す。
- `POST /api/tasks/archive` は完了タスクの一括アーカイブ。`{ ids }` を渡すとその id のみ
  （完了以外が混ざると 400 で全体をロールバック）、省略時は `{ projectId?, completedBefore? }` に
  合致する完了タスクすべて。削除はせず `archivedAt` を付けるだけ。応答は `{ count, tasks }`。
- `POST /api/tasks/unarchive` は `{ ids }` のアーカイブ解除（ステータスは完了のまま）。
  `PATCH` / `reorder` で完了以外のステータスへ戻した場合も自動でアーカイブ解除される。
- `POST /api/tasks` の `position` は同一プロジェクト・同一ステータス内の最大値 + 1。
  ステータスが `done` になると `completedAt` が入り、`done` から外れると `null` に戻る。
- `POST /api/tasks/reorder` は 1 トランザクションで更新し、更新後のタスク配列を返す。
- `POST /api/import` は `{ mode: 'replace' | 'merge', data: ExportData }`。`replace` は全削除して id ごと復元、
  `merge` は新しい id を採番して参照を張り替える（同名タグは既存を再利用）。応答は
  `{ ok: true, mode, imported: { members, projects, tags, tasks, comments } }`。
- JSON ボディの上限は 5mb。

## ビルド出力について

`shared/types.ts` を共有コンパイルする都合上、`tsc` の出力は `dist/server/src/` と `dist/shared/` に分かれる。
起動パスを固定するため、ビルド後に `dist/index.js`（実体を読み込むだけの 1 行）を生成している。
