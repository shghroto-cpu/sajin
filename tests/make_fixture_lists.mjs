// 브라우저 테스트용 대상목록 파일(.sajin) 만들기 (가짜 엑셀 + 테스트 전용 비밀번호, 앱에 내장된 data/crypto.json 솔트 사용)
// 사용: node tests/make_fixture_lists.mjs <출력폴더>
//   team1.sajin    : 1팀 7곳 (출장자 일팀갑·일팀을)
//   team2.sajin    : 2팀 5곳 (출장자 「이팀 갑」·이팀을, 마바아파트는 1팀과 공통)
//   team2_v2.sajin : 2팀 같은 목록(listId)의 새 판 — 이팀가빌딩 주소 변경 + 이팀마빌딩 추가 (6곳)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { I, X, LC, JSZip, loadCfg } from '../scripts/listlib.mjs';
import { fakeRows } from './fake_rows.mjs';

const PASS = 'test-only-passphrase-0000';
const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
const parsed = I.parseWorkbook((await X.readXlsx(readFileSync(new URL('./fixtures/sample_list.xlsx', import.meta.url)), JSZip)).sheets);
const R = parsed.rows;
const fake = (base, no, facility, dateKey, travelers) => Object.assign({}, base, { no, facility, owner: facility + ' 관리사무소', dateKey, dateLabel: dateKey, wd: '', ampm: '', travelers });
const team1 = R.map(r => Object.assign({}, r, { travelers: ['일팀갑', '일팀을'] }));
const t2 = ['이팀 갑', '이팀을'];
const team2 = [Object.assign({}, R[2], { no: 1, travelers: t2 }), ...['가', '나', '다', '라'].map((c, i) => fake(R[0], i + 2, `이팀${c}빌딩`, '2026-11-05', t2))];
const team2v2 = team2.map(r => r.facility === '이팀가빌딩' ? Object.assign({}, r, { location: '변경된주소 1' }) : r).concat([fake(R[0], 6, '이팀마빌딩', '2026-11-05', t2)]);

const cfg = loadCfg(), salt = LC.currentSalt(cfg);
const key = await LC.deriveKey(PASS, salt.salt, cfg.iter);
async function write(name, c) { writeFileSync(join(dir, name), JSON.stringify(await LC.encryptList(key, c, { iter: cfg.iter, saltId: salt.id }))); }
const c2 = LC.makeContent({ teamName: '2팀 (시험권)', name: parsed.name, rows: team2 });
await write('team1.sajin', LC.makeContent({ teamName: '1팀 (시험권)', name: parsed.name, rows: team1 }));
await write('team2.sajin', c2);
await write('team2_v2.sajin', LC.makeContent({ listId: c2.listId, teamName: '2팀 (시험권)', name: parsed.name, rows: team2v2, now: new Date(Date.now() + 61000) }));

// QR 주소 (qr.json): 3팀 같은 목록의 판 3개 (옛 판·1장·새 판 2장) + 4팀 1장(가짜 카메라용 영상 qr_cam.y4m)
//   주소의 # 뒤만 쓰므로 앞부분은 아무 https 주소
const require = createRequire(import.meta.url);
globalThis.fflate = require('fflate'); globalThis.qrcode = require('qrcode-generator');
require('../src/qrcodec.js');
const Q = globalThis.SajinQR, qo = o => Object.assign({ base: 'https://example.invalid/sajin/', saltId: salt.id }, o);
const t3 = fakeRows(5), now = Date.now();
const c3 = LC.makeContent({ teamName: '3팀 (시험권)', name: '2026년 99차 대상(가짜)', rows: t3, now: new Date(now) });
const c3old = Object.assign({}, c3, { listVersion: LC.listVersion(new Date(now - 61000)) });
const c3v2 = LC.makeContent({ listId: c3.listId, teamName: '3팀 (시험권)', name: '2026년 99차 대상(가짜)', now: new Date(now + 61000),
  rows: t3.map((r, i) => i === 1 ? Object.assign({}, r, { location: '변경된주소 2' }) : r).concat(fakeRows(1, 99).map(r => Object.assign(r, { no: 6, facility: '새로추가빌딩' }))) });
const c4 = LC.makeContent({ teamName: '4팀 (카메라)', name: '2026년 99차 대상(가짜)', rows: fakeRows(4, 11) });
const qr = { one: (await Q.encode(key, c3, qo())).urls, old: (await Q.encode(key, c3old, qo())).urls,
  two: (await Q.encode(key, c3v2, qo({ maxLen: 700 }))).urls, cam: (await Q.encode(key, c4, qo())).urls,
  facility3: t3[1].facility };
if (qr.one.length !== 1 || qr.two.length !== 2 || qr.cam.length !== 1) throw new Error('QR 장수가 예상과 다름');
writeFileSync(join(dir, 'qr.json'), JSON.stringify(qr));
// 가짜 카메라 영상 (Y4M, 640x480 흑백, QR 한 칸 4px)
const m = Q.matrix(qr.cam[0]), W = 640, H = 480, S = 4, ox = (W - m.size * S) >> 1, oy = (H - m.size * S) >> 1;
const Y = Buffer.alloc(W * H, 235);
for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c))
  for (let y = 0; y < S; y++) Y.fill(16, (oy + r * S + y) * W + ox + c * S, (oy + r * S + y) * W + ox + c * S + S);
const UV = Buffer.alloc(W * H / 2, 128), frames = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
for (let i = 0; i < 10; i++) frames.push(Buffer.from('FRAME\n'), Y, UV);
writeFileSync(join(dir, 'qr_cam.y4m'), Buffer.concat(frames));
console.log('대상목록 테스트 파일:', dir);
