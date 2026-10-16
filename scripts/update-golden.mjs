// 戦闘の挙動を意図して変えたときに、ゴールデンテストの保存値を作り直す
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['--test', 'app/test/golden.test.mjs'], { stdio: 'inherit', env: { ...process.env, UPDATE_GOLDEN: '1' } });
process.exit(r.status ?? 1);
