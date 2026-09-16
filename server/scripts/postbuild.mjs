// tsc は shared/types.ts も一緒にコンパイルするため、出力は dist/server/src/ と dist/shared/ に分かれる。
// 起動パスを dist/index.js に固定するための入口ファイルを生成する（外部依存なし）。
import { writeFileSync } from 'node:fs';

const entry = new URL('../dist/index.js', import.meta.url);
writeFileSync(entry, "import './server/src/index.js';\n", 'utf8');
