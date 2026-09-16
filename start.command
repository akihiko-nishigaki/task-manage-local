#!/bin/bash
# macOS: このファイルをダブルクリックするとタスク管理ツールが起動します。
cd "$(dirname "$0")" || exit 1
node scripts/start.mjs
