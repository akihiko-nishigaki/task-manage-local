# 社内タスク管理ツール（ローカル完結版）

社内利用専用のタスク管理ツールです。**データは一切インターネットへ送信しません。**
すべてのデータはこの PC（またはサーバー）上の SQLite ファイル 1 個に保存されます。

## 特徴

- プロジェクト / タスク / カンバン / リスト / ダッシュボード / メンバー / タグ / コメント
- 外部 API・CDN・Web フォント・アナリティクス・テレメトリを一切使用しない
- ブラウザ側にも `Content-Security-Policy: default-src 'self'` を適用し、外部通信をブラウザレベルで遮断
- 既定では `127.0.0.1` のみで待ち受け（自分の PC からしかアクセスできない）
- JSON エクスポート / インポートでバックアップ・移行が可能

## 必要環境

- Node.js 22.13 以上（SQLite は Node.js 内蔵の `node:sqlite` を使用。追加のネイティブビルド不要）

## セットアップと起動

```bash
npm install
npm run build
npm start
```

ブラウザで http://127.0.0.1:3000 を開きます。

### 社内 LAN で共有する場合

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

社内の他の PC から `http://<このマシンのIP>:3000` でアクセスできます。
LAN 内からのみアクセスできるよう、ファイアウォールやルーターの設定で外部公開しないでください。

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 待ち受けアドレス。LAN 共有時は `0.0.0.0` |
| `PORT` | `3000` | 待ち受けポート |
| `DATA_DIR` | `./data` | SQLite ファイル（`tasks.db`）の保存先 |

## バックアップ

以下のいずれかで行います。

1. サーバー停止後に `data/tasks.db` をコピーする
2. 画面の「設定」→「エクスポート」で JSON をダウンロードする（復元は「インポート」）

## 開発

```bash
npm run dev            # サーバー(3000) と Vite 開発サーバー(5173) を起動
npm run test           # API テスト
npm run typecheck      # 型検査
npm run check:offline  # 外部 URL が含まれていないことを検査
```

## オフライン保証の仕組み

| 層 | 対策 |
| --- | --- |
| データ保存 | ローカル SQLite のみ。クラウドサービス不使用 |
| サーバー | 外部へ HTTP リクエストを送るコードが存在しない（`npm run check:offline` で検査） |
| クライアント | 依存をすべてバンドル。CDN / Web フォント / 外部画像を参照しない |
| ブラウザ | CSP `default-src 'self'` により、万一外部 URL が混入しても通信を遮断 |
| ネットワーク | 既定で `127.0.0.1` 待ち受け。LAN 共有は明示的な指定が必要 |

`npm install` はパッケージ取得のためインターネットへアクセスします（データの送信はありません）。
完全な隔離環境で運用する場合は、インターネット接続のある環境で `npm install && npm run build` を実行し、
`node_modules` と `client/dist` `server/dist` ごとコピーしてください。

## 構成

```
shared/   共有型定義（API 契約）
server/   Express + node:sqlite の API サーバー（静的ファイル配信も担当）
client/   Vite + React の UI
docs/     計画書
scripts/  検査スクリプト
```

詳細な計画・API 仕様は [docs/PLAN.md](docs/PLAN.md) を参照してください。
