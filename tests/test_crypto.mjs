// 대상목록 파일(.sajin) 암호화·만들기 스크립트 테스트 (테스트 전용 비밀번호, 가짜 엑셀, 저장소 밖 임시 폴더만 사용)
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { I, X, LC, JSZip } from '../scripts/listlib.mjs';

const PASS = 'test-only-passphrase-0000', PASS2 = 'test-only-new-passphrase-1111';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = fileURLToPath(new URL('./fixtures/sample_list.xlsx', import.meta.url));
const parsed = I.parseWorkbook((await X.readXlsx(readFileSync(FX), JSZip)).sheets);

// 1) 만들기 → 열기 = 원본, 틀린 비밀번호는 keyCheck 에서 실패, 평문에 정보 없음
const cfg = { iter: LC.ITER, salts: [{ id: '2026A', salt: LC.newSalt() }] };
const key = await LC.deriveKey(PASS, cfg.salts[0].salt);
const content = LC.makeContent({ teamName: '시험3팀', name: parsed.name, rows: parsed.rows });
assert.match(content.listId, /^[0-9a-f-]{32,36}$/, '랜덤 listId');
assert.deepEqual(content.team.members.sort(), ['시험자갑', '시험자병', '시험자을'], '출장자 열에서 팀원 자동 수집');
assert.deepEqual(content.batch, { id: '99-9', name: parsed.name, dates: ['2026-11-02', '2026-11-03', '2026-11-04'] });
const file = await LC.encryptList(key, content, { saltId: '2026A' });
assert.equal(file.type, 'sajin-list'); assert.equal(file.v, 2); assert.equal(file.kdf.saltId, '2026A'); assert.equal(file.kdf.iter, 600000);
assert.deepEqual(await LC.decryptList(key, JSON.parse(JSON.stringify(file))), content, '왕복 복원');
const wrong = await LC.deriveKey('wrong-passphrase-00000', cfg.salts[0].salt);
assert.equal(await LC.checkKey(wrong, file), false);
await assert.rejects(LC.decryptList(wrong, file), e => e.code === 'badkey' && !/아파트|시험/.test(e.message), '틀린 비밀번호: 내용 노출 없이 실패');
const txt = JSON.stringify(file);
for (const s of ['가나아파트', '시험3팀', '000-0000-0001', '시험자갑', '가상도', '99년']) assert.ok(!txt.includes(s), `평문에 ${s} 노출`);
assert.deepEqual(Object.keys(file).sort(), ['alg', 'createdAt', 'ct', 'iv', 'kdf', 'keyCheck', 'type', 'v']);
assert.ok(Buffer.byteLength(txt) < LC.MAX_BYTES, '100KB 이하');
assert.equal(LC.fileName(content), '대상목록_시험3팀_99-9.sajin');
assert.equal(LC.fileName(content, 'txt'), '대상목록_시험3팀_99-9.txt');
assert.throws(() => LC.checkPass('short-pass'), /12자 이상/);

// 2) 같은 listId: 새 판 / 같은 판 / 옛 판
assert.equal(LC.versionState(undefined, '20261028-090000'), 'new');
assert.equal(LC.versionState('20261028-090000', '20261028-090100'), 'new');
assert.equal(LC.versionState('20261028-090000', '20261028-090000'), 'same');
assert.equal(LC.versionState('20261028-090100', '20261028-090000'), 'old');
const v2 = LC.makeContent({ listId: content.listId, teamName: '시험3팀', name: parsed.name, rows: parsed.rows, now: new Date(Date.now() + 61000) });
assert.equal(v2.listId, content.listId, 'listId 이어받기');
assert.equal(LC.versionState(content.listVersion, v2.listVersion), 'new');

// 3) 솔트 2개(이전·새): 두 판 파일 모두 열림
const cfg2 = { iter: LC.ITER, salts: cfg.salts.concat([{ id: LC.newSaltId(cfg), salt: LC.newSalt() }]) };
assert.equal(cfg2.salts[1].id, '2026B'); assert.equal(LC.currentSalt(cfg2).id, '2026B');
const keyB = await LC.deriveKey(PASS2, cfg2.salts[1].salt);
const fileB = await LC.encryptList(keyB, v2, { saltId: '2026B' });
for (const f of [file, fileB]) {
  const s = LC.saltById(cfg2, f.kdf.saltId), p = s.id === '2026A' ? PASS : PASS2;
  assert.ok(await LC.decryptList(await LC.deriveKey(p, s.salt), f), `${s.id} 파일 열림`);
}
assert.equal(LC.saltById(cfg2, '2099Z'), null, '모르는 솔트');

// 4) 만들기 스크립트 (임시 폴더: 솔트 파일·비밀번호 파일·엑셀·결과)
const tmp = mkdtempSync(join(tmpdir(), 'sajin-test-'));
const env = Object.assign({}, process.env, { SAJIN_CRYPTO_FILE: join(tmp, 'crypto.json'), SAJIN_PASSFILE: join(tmp, 'pass.txt') });
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: r.status, out: r.stdout + r.stderr };
};
const sajins = () => readdirSync(tmp).filter(f => /\.(sajin|txt)$/.test(f) && f !== 'pass.txt');
try {
  writeFileSync(env.SAJIN_CRYPTO_FILE, JSON.stringify({ v: 2, iter: LC.ITER, salts: [{ id: '2026A', salt: cfg.salts[0].salt }] }));
  const xl = join(tmp, '대상목록.xlsx'); copyFileSync(FX, xl);
  let r = run('publish_list.mjs', xl, '--team-name', '시험3팀');
  assert.notEqual(r.code, 0); assert.match(r.out, /비밀번호 파일이 없습니다/, '비밀번호 파일 없으면 안내');
  writeFileSync(env.SAJIN_PASSFILE, 'short\n');
  assert.match(run('publish_list.mjs', xl, '--team-name', '시험3팀').out, /12자 이상/, '짧은 비밀번호 거부');
  writeFileSync(env.SAJIN_PASSFILE, '﻿' + PASS + '\r\n');   // 메모장(UTF-8 BOM, CRLF) 저장 형식
  assert.match(run('publish_list.mjs', FX, '--team-name', '시험3팀').out, /sajin-app 폴더 밖으로/, '저장소 안 엑셀 거부');
  r = run('publish_list.mjs', xl, '--team-name', '시험3팀', '--out', join(ROOT, 'tests', 'out'));
  assert.notEqual(r.code, 0); assert.match(r.out, /sajin-app 폴더 밖에 만들어야/, '저장소 안으로 목록 파일 만들기 거부');
  assert.match(run('publish_list.mjs', xl, '--team', '3', '--team-name', 'x').out, /더 이상 쓰지 않습니다/, '--team 폐지');
  assert.match(run('publish_list.mjs', xl).out, /--team-name/, '팀 이름 필수');
  assert.equal(sajins().length, 0, '실패하면 파일을 만들지 않음');

  r = run('publish_list.mjs', xl, '--team-name', '시험3팀 (가상권)');
  assert.equal(r.code, 0, r.out); assert.match(r.out, /7곳/); assert.match(r.out, /자차아파트: 준공일/, '미리보기 경고');
  assert.ok(!r.out.includes(PASS), '비밀번호 출력 금지');
  assert.deepEqual(sajins(), ['대상목록_시험3팀가상권_99-9.sajin'], '엑셀과 같은 폴더에 .sajin');
  const f1 = JSON.parse(readFileSync(join(tmp, sajins()[0]), 'utf8'));
  assert.ok(!JSON.stringify(f1).includes('가나아파트') && !JSON.stringify(f1).includes('시험3팀'), '평문 노출 없음');
  const c1 = await LC.decryptList(key, f1);
  assert.equal(c1.team.name, '시험3팀 (가상권)'); assert.equal(c1.sites.length, 7); assert.equal(c1.sites[0].phone, '000-0000-0001');
  assert.ok(!existsSync(join(ROOT, sajins()[0])), '저장소에 파일 없음');

  // 이전 목록 이어받기 (--prev): listId 유지, 바뀐 시설물 표시, .txt 저장
  const prevPath = join(tmp, 'prev.sajin'); copyFileSync(join(tmp, sajins()[0]), prevPath);
  r = run('publish_list.mjs', xl, '--team-name', '시험3팀 (가상권)', '--prev', prevPath, '--no-contacts', '--txt');
  assert.equal(r.code, 0, r.out); assert.match(r.out, /이어받습니다/); assert.match(r.out, /추가 0곳/); assert.match(r.out, /바뀜 0곳/, '엑셀이 같으면 바뀐 시설물 없음');
  const c2 = await LC.decryptList(key, JSON.parse(readFileSync(join(tmp, '대상목록_시험3팀가상권_99-9.txt'), 'utf8')));
  assert.equal(c2.listId, c1.listId, 'listId 유지'); assert.equal(c2.sites[0].phone, '');
  assert.equal(LC.versionState(c1.listVersion, c2.listVersion) === 'old', false);

  // 비밀번호 교체: 새 솔트 추가, 이전 파일도 이전 솔트로 열림, 새 파일은 새 솔트
  writeFileSync(env.SAJIN_PASSFILE, PASS2);
  r = run('rotate_passphrase.mjs'); assert.equal(r.code, 0, r.out); assert.ok(!r.out.includes(PASS2));
  const cfgR = JSON.parse(readFileSync(env.SAJIN_CRYPTO_FILE, 'utf8'));
  assert.deepEqual(cfgR.salts.map(s => s.id), ['2026A', '2026B']);
  assert.ok(await LC.decryptList(await LC.deriveKey(PASS, LC.saltById(cfgR, '2026A').salt), f1), '이전 파일 열림');
  r = run('publish_list.mjs', xl, '--team-name', '새비번팀'); assert.equal(r.code, 0, r.out);
  const fN = JSON.parse(readFileSync(join(tmp, '대상목록_새비번팀_99-9.sajin'), 'utf8'));
  assert.equal(fN.kdf.saltId, '2026B');
  assert.ok(await LC.decryptList(await LC.deriveKey(PASS2, LC.saltById(cfgR, '2026B').salt), fN), '새 파일은 새 비밀번호');
  // 이전 목록이 이전 비밀번호로 만들어졌으면 --prev 는 안내 후 중단
  assert.match(run('publish_list.mjs', xl, '--team-name', 'x', '--prev', prevPath).out, /지금 비밀번호로 열리지 않습니다/);
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log('암호화 테스트 통과: .sajin 왕복·틀린 비밀번호·평문 노출 없음·listId 판 비교·솔트 2개·만들기 스크립트(저장소 밖)·비밀번호 교체');
