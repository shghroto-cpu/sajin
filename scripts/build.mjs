// src/ 의 파일과 template/ 의 양식 데이터를 합쳐 배포용 단일 파일 index.html 을 만든다.
// 사용: npm run build   (Node 18 이상, 외부 패키지 불필요)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(root, p), 'utf8');

const shell = rd('src/index.html');
const css = rd('src/styles.css').trimEnd();
const gen = rd('src/hwpxgen.js').trimEnd();
const xlsx = rd('src/xlsxreader.js').trimEnd();
const imp = rd('src/importer.js').trimEnd();
const app = rd('src/app.js').trimEnd();
const VERSION = '2026.10.28-C';
const tpl = JSON.stringify(JSON.parse(rd('template/tpl.json'))).replace(/<\//g, '<\\/');
const b64 = rd('template/base.b64').trim();

for (const [name, marker] of [['src/index.html', '/*@@STYLE@@*/'], ['src/index.html', '<!--@@SCRIPTS@@-->']])
  if (!shell.includes(marker)) throw new Error(`${name}에 ${marker} 표시가 없습니다.`);

const scripts =
  `<script type="application/json" id="hwpxTpl">${tpl}</script>\n` +
  `<script type="text/plain" id="hwpxBase">${b64}</script>\n` +
  [gen, xlsx, imp, app].map(js => `<script>\n${js}\n</script>`).join('\n');

const html = shell.replaceAll('@@VERSION@@', VERSION).replace('/*@@STYLE@@*/', () => css).replace('<!--@@SCRIPTS@@-->', () => scripts);
for (const out of ['index.html', 'dist/index.html']) {
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), html);
}
console.log(`빌드 완료: index.html (${(html.length / 1048576).toFixed(2)} MB)`);
