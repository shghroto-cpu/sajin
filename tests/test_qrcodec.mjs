// QR 대상목록 테스트: 짧은 키 왕복, QR 장수·주소 길이 측정, 조각 모으기, 틀린 비밀번호, QR 그림 → jsQR 판독 왕복
// 테스트 전용 비밀번호와 가짜 목록만 쓴다. 측정 표는 작업 기록에 옮겨 적는다.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { LC } from '../scripts/listlib.mjs';
import { fakeRows } from './fake_rows.mjs';

const require = createRequire(import.meta.url);
globalThis.fflate = require('fflate'); globalThis.qrcode = require('qrcode-generator');
const jsQR = require('jsqr');
require('../src/qrcodec.js');
const Q = globalThis.SajinQR;
const PASS = 'test-only-passphrase-0000', SALT = 'VPBoX8bfpq1LFfXhsDnrmQ==', BASE = 'https://example.invalid/sajin/';

const NAME = '2026년 99차 관리주체 합동점검 대상(가짜)';
const content = (n, wc, o) => LC.makeContent(Object.assign({ teamName: '3팀 (시험권)', name: NAME, rows: fakeRows(n), withContact: wc }, o));
const key = await LC.deriveKey(PASS, SALT, 1000);
const enc = (c, o) => Q.encode(key, c, Object.assign({ base: BASE, saltId: '2026A' }, o));
const collect = urls => { const b = {}; urls.forEach(u => Q.addPart(b, Q.parsePart(u))); return b; };

// 1) 짧은 키 → 원복 = 원본 (특이 값: 번호 건너뜀, 날짜 표시·요일 직접 입력, 관리주체가 시설물명과 다름, 출장자 없이 인원만)
{
  const c = content(6, true);
  c.sites[1].no = 9; c.sites[2].dateLabel = '2026-11-02 (월) 오전'; c.sites[3].wd = ''; c.sites[3].dateLabel = '';
  c.sites[4].dateKey = ''; c.sites[4].wd = ''; c.sites[4].dateLabel = '11월 중';
  assert.deepEqual(Q.unpack(JSON.parse(JSON.stringify(Q.pack(c)))), c, '짧은 키 왕복');
  const t = LC.makeContent({ teamName: '팀', name: NAME, rows: fakeRows(3), withTravelers: false });
  assert.deepEqual(Q.unpack(Q.pack(t)), t, '출장자 이름 빼기(인원만) 왕복');
  const p = JSON.stringify(Q.pack(c));
  assert.ok(!/facility|location|purpose|resultHeading|defaultLabel/.test(p), '긴 키·고정값 없음');
}

// 2) 측정: 시설 수별 QR 장수·조각 주소 길이 (앱 주소 https://<아이디>.github.io/sajin/ 길이 기준)
const REAL_BASE = 'https://shghroto-cpu.github.io/sajin/';
const table = [];
for (const n of [5, 10, 20, 30]) for (const wc of [false, true]) {
  const c = content(n, wc), e = await enc(c, { base: REAL_BASE });
  assert.ok(e.urls.every(u => u.length <= Q.MAX_URL), '조각 주소 1,100자 이하');
  table.push({ n, wc, parts: e.parts, longest: e.longest, bytes: e.bytes });
}
console.log('| 시설 수 | 연락처 | QR 장수 | 가장 긴 조각 주소(자) | 암호화 데이터(바이트) |\n|---|---|---|---|---|');
table.forEach(r => console.log(`| ${r.n} | ${r.wc ? '포함' : '제외'} | ${r.parts} | ${r.longest} | ${r.bytes} |`));
assert.ok(table.filter(r => r.n <= 10 && !r.wc).every(r => r.parts === 1), '시설 10곳 이하(연락처 제외)는 QR 1장');

// 3) 조각 순서 섞기·중복 → 정상 복원, 다른 묶음은 따로 모음
{
  const c = content(30, true), e = await enc(c, { maxLen: 500 });
  assert.ok(e.parts >= 3, '여러 조각');
  const shuffled = e.urls.slice().reverse().concat([e.urls[1], e.urls[0]]);
  const b = {}; let done = false;
  shuffled.forEach(u => { done = Q.addPart(b, Q.parsePart(u)); });
  assert.ok(done && Q.isComplete(b));
  assert.deepEqual(await Q.decrypt(key, Q.join(b)), c, '섞인 순서·중복 조각 복원');
  const other = await enc(c, { maxLen: 500 });
  assert.notEqual(other.bid, e.bid, '다시 만든 QR은 다른 묶음 식별값');
  const bundles = {};
  [e.urls[0], other.urls[0], other.urls[1], e.urls[1]].forEach(u => { const p = Q.parsePart(u); bundles[p.bid] = bundles[p.bid] || {}; Q.addPart(bundles[p.bid], p); });
  assert.deepEqual(Object.keys(bundles).sort(), [e.bid, other.bid].sort());
  assert.deepEqual(Q.received(bundles[e.bid]), [1, 2]); assert.equal(Q.isComplete(bundles[e.bid]), false);
  const partial = {}; Q.addPart(partial, Q.parsePart(e.urls[0]));
  assert.throws(() => Q.join(partial), /다 모이지/);
}

// 4) 틀린 비밀번호 → 실패, 평문 일부도 노출 없음. 주소의 # 앞에는 데이터 없음
{
  const c = content(5, true), e = await enc(c);
  const wrong = await LC.deriveKey('wrong-passphrase-00000', SALT, 1000);
  await assert.rejects(Q.decrypt(wrong, Q.join(collect(e.urls))), er => er.code === 'badkey' && /QR이 손상/.test(er.message) && !er.message.includes(c.sites[0].facility));
  assert.equal(await Q.check(wrong, Q.join(collect(e.urls))), false);
  assert.equal(await Q.check(key, Q.join(collect(e.urls))), true);
  for (const u of e.urls) {
    assert.equal(u.split('#')[0], BASE, '# 앞은 앱 주소뿐');
    assert.ok(!u.includes('?'), '? 쿼리 없음');
    for (const s of [c.team.name, c.sites[0].facility, '시험자갑', '000-0000', '관리사무소', c.listId]) assert.ok(!u.includes(s) && !u.includes(encodeURIComponent(s)), `주소에 ${s} 노출`);
  }
  assert.equal(Q.join(collect(e.urls)).saltId, '2026A');
  const bad = collect(e.urls); bad.parts[1] = bad.parts[1].slice(0, -4) + (bad.parts[1].endsWith('AAAA') ? 'BBBB' : 'AAAA');
  await assert.rejects(Q.decrypt(key, Q.join(bad)), er => er.code === 'badkey', '손상된 QR');
  // 이 앱 형식이 아닌 주소
  for (const s of ['https://example.com/', 'https://x/#list=abc', 'https://x/#q=3.2.abcd.xx', 'https://x/?q=1.1.abcd.xx', 'hello'])
    assert.equal(Q.parsePart(s), null, s);
  await assert.rejects(enc(c, { base: 'file:///C:/x/index.html' }), /앱 주소/);
}

// 5) QR 그림 → jsQR 판독 = 원래 주소 (화면용 크게, 4cm 인쇄 300dpi)
function raster(text, px) {
  const m = Q.matrix(text), w = m.size + 8, data = new Uint8ClampedArray(px * px * 4);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const r = Math.floor(y * w / px) - 4, c = Math.floor(x * w / px) - 4;
    const v = r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c) ? 0 : 255, o = (y * px + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
  }
  return data;
}
{
  const e = await enc(content(10, true), { base: REAL_BASE });
  const size = Q.matrix(e.urls[0]).size;
  for (const [label, px] of [['화면용(한 칸 6px)', (size + 8) * 6], ['4cm 인쇄(300dpi, 472px)', 472]]) {
    const r = jsQR(raster(e.urls[0], px), px, px);
    assert.ok(r, `${label} 판독`); assert.equal(r.data, e.urls[0], `${label} 주소 일치`);
  }
  assert.match(Q.svg(e.urls[0]), /^<svg[^>]+viewBox="0 0 \d+ \d+"[\s\S]*fill="#fff"/, 'SVG 흰 바탕');
  console.log(`QR 판독 왕복 통과 (10곳·연락처 포함: ${Q.matrix(e.urls[0]).size}칸, 4cm 인쇄 시 한 칸 약 ${(40 / (Q.matrix(e.urls[0]).size + 8)).toFixed(2)}mm)`);
}
console.log('QR 대상목록 테스트 통과');
