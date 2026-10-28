// src/ 의 파일과 template/ 의 양식 데이터를 합쳐 배포용 단일 파일 index.html 을 만든다.
// 함께 오프라인 관리 파일 dist/admin.html(대상목록 파일 만들기, 외부 요청 없음)도 만든다.
// 사용: npm run build   (Node 18 이상, 외부 패키지 불필요)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(root, p), 'utf8');
const inline = js => js.replace(/<\/script/gi, '<\\/script');

const shell = rd('src/index.html');
const adminShell = rd('src/admin.html');
const css = rd('src/styles.css').trimEnd();
const gen = rd('src/hwpxgen.js').trimEnd();
const xlsx = rd('src/xlsxreader.js').trimEnd();
const imp = rd('src/importer.js').trimEnd();
const lcr = rd('src/listcrypto.js').trimEnd();
const qrc = rd('src/qrcodec.js').trimEnd();
const adm = rd('src/admin.js').trimEnd();
const app = rd('src/app.js').trimEnd();
const VERSION = '2026.10.30-F';
const tpl = JSON.stringify(JSON.parse(rd('template/tpl.json'))).replace(/<\//g, '<\\/');
const b64 = rd('template/base.b64').trim();

// 솔트(비밀 아님)를 앱·관리 파일에 내장: 휴대폰은 서버에서 아무것도 받지 않는다
const cfg = JSON.parse(rd('data/crypto.json'));
if (!cfg.salts || !cfg.salts.length) throw new Error('data/crypto.json 에 솔트가 없습니다.');
const CRYPTO = JSON.stringify({ iter: cfg.iter, salts: cfg.salts.map(s => ({ id: s.id, salt: s.salt })) });
// 관리 파일의 메일 안내에 넣을 앱 주소 (git 원격 주소 → GitHub Pages 주소)
let appUrl = '';
try {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root }).toString());
  if (m) appUrl = `https://${m[1].toLowerCase()}.github.io/${m[2]}/`;
} catch (e) {}
const boot = `<script>window.SAJIN_CRYPTO = ${CRYPTO}; window.SAJIN_APP_URL = ${JSON.stringify(appUrl)};</script>\n`;

// 내장 라이브러리 (CDN 에서 불러오지 않음): 버전 고정 + 라이선스 주석 유지
const LIBS = {
  fflate: ['fflate', '0.8.2', 'umd/index.js', '/*! fflate 0.8.2 | MIT License | (c) 2023 Arjun Barrett | https://github.com/101arrowz/fflate */'],
  qrgen: ['qrcode-generator', '1.4.4', 'qrcode.js', '/*! qrcode-generator 1.4.4 | MIT License | (c) 2009 Kazuhiko Arase | https://github.com/kazuhikoarase/qrcode-generator */'],
  jsqr: ['jsqr', '1.4.0', 'dist/jsQR.js', '/*! jsQR 1.4.0 | Apache License 2.0 | (c) Cosmo Wolfe | https://github.com/cozmo/jsQR */']
};
const lib = {};
for (const [k, [pkg, ver, file, head]] of Object.entries(LIBS)) {
  const got = JSON.parse(rd(`node_modules/${pkg}/package.json`)).version;
  if (got !== ver) throw new Error(`${pkg} 버전이 ${got} 입니다 (${ver} 필요). npm install 을 다시 하세요.`);
  lib[k] = head + '\n' + inline(rd(`node_modules/${pkg}/${file}`).trimEnd());
}

for (const [name, s] of [['src/index.html', shell], ['src/admin.html', adminShell]])
  for (const marker of ['/*@@STYLE@@*/', '<!--@@SCRIPTS@@-->'])
    if (!s.includes(marker)) throw new Error(`${name}에 ${marker} 표시가 없습니다.`);

const scripts = boot +
  `<script type="application/json" id="hwpxTpl">${tpl}</script>\n` +
  `<script type="text/plain" id="hwpxBase">${b64}</script>\n` +
  [gen, xlsx, imp, lcr, lib.fflate, lib.qrgen, lib.jsqr, qrc, adm, app].map(js => `<script>\n${js}\n</script>`).join('\n');
const html = shell.replaceAll('@@VERSION@@', VERSION).replace('/*@@STYLE@@*/', () => css).replace('<!--@@SCRIPTS@@-->', () => scripts);
for (const out of ['index.html', 'dist/index.html']) {
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), html);
}

// 오프라인 관리 파일: JSZip 을 CDN 대신 파일 안에 넣음 (MIT 라이선스 주석 유지), 웹폰트 없음
const jszip = rd('node_modules/jszip/dist/jszip.min.js').trimEnd();
const adminScripts = boot + [jszip, xlsx, imp, lcr, lib.fflate, lib.qrgen, qrc, adm].map(js => `<script>\n${inline(js)}\n</script>`).join('\n');
const adminHtml = adminShell.replaceAll('@@VERSION@@', VERSION).replace('/*@@STYLE@@*/', () => css).replace('<!--@@SCRIPTS@@-->', () => adminScripts);
if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(adminHtml)) throw new Error('admin.html 에 외부 주소 참조가 있습니다.');
writeFileSync(join(root, 'dist/admin.html'), adminHtml);
console.log(`빌드 완료: index.html (${(html.length / 1048576).toFixed(2)} MB), dist/admin.html (${(adminHtml.length / 1024).toFixed(0)} KB, 오프라인)`);
