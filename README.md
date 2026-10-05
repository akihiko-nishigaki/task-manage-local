# 社内タスク管理ツール（ローカル完結版）

社内利用専用のタスク管理ツールです。**データは一切インターネットへ送信しません。**
すべてのデータはこの PC（またはサーバー）上の SQLite ファイル 1 個に保存されます。

## 特徴

- プロジェクト / タスク / カンバン / リスト / ダッシュボード / メンバー / タグ / コメント
- 溜まった完了タスクをワンクリックで一括アーカイブ（削除せず「アーカイブ」画面に退避、いつでも復帰可能）
- 外部 API・CDN・Web フォント・アナリティクス・テレメトリを一切使用しない
- ブラウザ側にも `Content-Security-Policy: default-src 'self'` を適用し、外部通信をブラウザレベルで遮断
- 既定では `127.0.0.1` のみで待ち受け（自分の PC からしかアクセスできない）
- JSON エクスポート / インポートでバックアップ・移行が可能

## 必要環境

- Node.js 22.13 以上（SQLite は Node.js 内蔵の `node:sqlite` を使用。追加のネイティブビルド不要）

## やり取りのチャネルとリンク

タスクごとに「どこでやり取りしているか」を記録できます。チャネルは メール / Teams / 口頭 から選びます。
あわせて関連するメールや Teams の投稿への**リンク**を登録でき、一覧やカードのリンクアイコンから新しいタブで開けます。

リンクに使えるのは `http://` `https://` `mailto:` `msteams:` のみです。
`javascript:` のような危険な形式は保存時に拒否します（画面・サーバー・インポートの三か所で検査します）。

## インストール版（Windows・社内配布用）

社内の人に配るときは、インストーラー形式の zip を渡します（ABS-Anken-Manage と同じ形式）。
受け取った人は zip を「すべて展開」して、展開したフォルダの `install.bat` をダブルクリックするだけです。
管理者権限は不要で、ユーザーフォルダ内だけにインストールされます。

| 項目 | 内容 |
| --- | --- |
| インストール先 | `%LOCALAPPDATA%\Programs\TaskManage` |
| データ保存先 | `%LOCALAPPDATA%	ask-manage-local\data	asks.db` |
| 起動 | デスクトップ / スタートメニューの「タスク管理」ショートカット |
| 終了 | インストール先の `stop.bat`（通常は電源を切れば終了） |
| アンインストール | 「設定 > アプリ」の一覧、またはインストール先の `uninstall.bat`（データは残る） |
| 前提ソフト | Node.js 22.13 以上（無い・古い場合はインストーラーが止まって案内を出します） |

### 配布する側

`package.json` の `version` を上げてから、次のコマンドを実行します（Windows でも Linux でも動きます）。

```bash
npm run build:installer
# → dist-installer/TaskManage-Setup-v<version>.zip
```

この zip を社内の共有フォルダなどに置いて配布してください。
サーバー側は 1 ファイルにまとめてあるため、配布物に `node_modules` は含まれません。
zip を展開すると、フォルダを辿らずに済むよう次の 4 つだけが並びます。
アプリ本体は `program.zip` にまとめてあり、`install.ps1` が展開します。

```
install.bat     ← これをダブルクリック
install.ps1     install.bat が呼び出す本体
program.zip     アプリ一式（server.cjs / launch.cjs / TaskManage.vbs / web/ など）
README.txt      受け取る人向けの手順
```

インストール先には `program.zip` の中身が展開されます。`install.bat` と `install.ps1` は
インストール先には置きません（配布 zip からのみ実行する運用にするため）。

### 受け取る側

1. zip を「すべて展開」し、展開したフォルダの `install.bat` をダブルクリックする
   - 確認の質問は無い。アプリ一式を `%LOCALAPPDATA%\Programs\TaskManage` にコピーし、デスクトップとスタートメニューに「タスク管理」のショートカットを作り、「設定 > アプリ」に登録して起動する
   - `install.bat` は最後に必ず一時停止するので、インストール元 / 先とインストールされた版（`VERSION`）を確認してからウィンドウを閉じる
   - 新しい版に入れ替えるときも同じ手順（起動中なら止めてから入れ替える。データには触らない）
   - `program.zip` が隣に無い場合はその旨を表示して中断する（zip を展開せずに実行した場合）
2. 消すときは「設定 > アプリ」または インストール先の `uninstall.bat`（ショートカット・登録・アプリのフォルダを消す。データは残る）

オプションを付けるときは PowerShell で `install.ps1` / `uninstall.ps1` を直接実行します（`.bat` に引数を付けても同じ）。

```
powershell -ExecutionPolicy Bypass -File install.ps1 -Startup          # PC 起動時に自動で立ち上げる
powershell -ExecutionPolicy Bypass -File install.ps1 -Dest D:\Tools\TaskManage
powershell -ExecutionPolicy Bypass -File uninstall.ps1 -RemoveData     # データも削除する
```

`install.ps1` のオプション: `-Dest`（インストール先）/ `-ShortcutDir`（ショートカットの場所）/ `-NoShortcut` / `-NoStartMenu` / `-Startup` / `-NoLaunch`。

インストール版でも通信の扱いは変わりません。データは端末内の SQLite に保存され、社外へは一切送信しません。
インターネットが必要なのは Node.js を入れるときだけです。

## かんたん起動（推奨）

OS に合わせて、次のファイルを**ダブルクリック**するだけです。

| OS | ファイル |
| --- | --- |
| Windows | `start.bat` |
| macOS | `start.command` |
| Linux | `start.sh` |

初回だけ依存パッケージの取得とビルドが自動で走り（数分かかります）、2 回目以降はすぐ起動します。
起動が終わると既定のブラウザが自動で開きます。終了するときは、開いた黒いウィンドウで `Ctrl + C` を押すか、ウィンドウを閉じてください。

- ポート 3000 が他のアプリで使われている場合は、自動で 3001 以降の空きポートを使います。
- macOS で「開発元を確認できません」と出たら、ファイルを右クリック →「開く」→「開く」を選びます。
- Node.js が入っていない場合はその旨が表示されます。https://nodejs.org/ja の LTS 版を入れてから、もう一度ダブルクリックしてください。

コマンドから起動する場合も同じです。

```bash
npm start
```

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
| `DATA_DIR` | （OS ごとの既定。下記） | SQLite ファイル（`tasks.db`）の保存先 |
| `NO_OPEN` | （未設定） | `1` にするとブラウザを自動で開かない |

### データの保存場所

データはアプリのフォルダの**外**、OS ごとのユーザーデータ領域に保存されます。
新しいバージョンの zip を別のフォルダに展開しても、データはそのまま引き継がれます。

| OS | 既定の保存先 |
| --- | --- |
| Windows | `%LOCALAPPDATA%	ask-manage-local\data	asks.db` |
| macOS | `~/Library/Application Support/task-manage-local/data/tasks.db` |
| Linux | `~/.local/share/task-manage-local/data/tasks.db`（`XDG_DATA_HOME` があればその下） |

実際の保存先は画面の「設定」→「現在のデータ」に表示されます。

v0.2.0 以前はアプリのフォルダ直下の `data/` に保存していました。旧バージョンのフォルダの上に上書き展開して起動すると、
初回起動時に旧 `data/tasks.db` を上記の場所へ自動でコピーして引き継ぎます（旧ファイルは削除せず、`data/MOVED.txt` に案内を残します）。
別のフォルダに展開した場合は、旧フォルダの `data` を新しいフォルダの直下にコピーしてから起動すれば同じように引き継がれます。

## もっと手軽にする（任意）

### PC 起動時に自動で立ち上げる

**Windows**: `Win + R` で `shell:startup` を開き、`start.bat` の**ショートカット**をそのフォルダに置きます。
サインイン時に自動で起動します。黒いウィンドウを出したくない場合は、ショートカットのプロパティで実行時の大きさを「最小化」にします。

**macOS**: 「システム設定」→「一般」→「ログイン項目」で `start.command` を追加します。

**Linux**: systemd のユーザーサービスに登録します。

```ini
# ~/.config/systemd/user/taskmanage.service
[Unit]
Description=社内タスク管理ツール
[Service]
WorkingDirectory=/path/to/task-manage-local
Environment=NO_OPEN=1
ExecStart=/usr/bin/node scripts/start.mjs
Restart=on-failure
[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now taskmanage
```

### 社内で 1 台だけ起動して全員で使う（おすすめの運用）

各自の PC に入れるのではなく、常時起動している 1 台（共有 PC や社内サーバー）で `HOST=0.0.0.0` にして起動し、
他の人はブラウザのブックマークから `http://<そのPCのIP>:3000` を開くだけにします。

- 利用者側はインストール作業が一切不要で、ブックマークを開くだけになります。
- データが 1 か所にまとまるため、バックアップもその 1 台だけで済みます。
- 上記の自動起動と組み合わせると、その PC を起動しておくだけで常に使える状態になります。
- IP アドレスは固定するか、社内 DNS で `task.社内ドメイン` のような名前を割り当てると、より覚えやすくなります。

## バックアップ

以下のいずれかで行います。

1. サーバー停止後に保存先の `tasks.db` をコピーする（場所は「設定」画面に表示。`tasks.db-wal` / `tasks.db-shm` があれば一緒に）
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
| データ保存 | ローカル SQLite のみ（ユーザーデータ領域に 1 ファイル）。クラウドサービス不使用 |
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
