#!/bin/bash
# Linux: ./start.sh で起動します。
cd "$(dirname "$0")" || exit 1
node scripts/start.mjs
