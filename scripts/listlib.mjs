// 대상목록 스크립트 공통: 경로, 솔트 목록(data/crypto.json), 비밀번호 파일 읽기(내용은 절대 출력하지 않음)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

if (!globalThis.crypto || !globalThis.crypto.subtle) globalThis.crypto = (await import('node:crypto')).webcrypto;
const require = createRequire(import.meta.url);
export const JSZip = require('jszip');
require('../src/xlsxreader.js'); require('../src/importer.js'); require('../src/listcrypto.js');
export const X = globalThis.SajinXlsx, I = globalThis.SajinImport, LC = globalThis.SajinListCrypto;

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 테스트는 SAJIN_CRYPTO_FILE·SAJIN_PASSFILE 로 저장소 밖 임시 파일을 쓴다
export const CFGFILE = resolve(process.env.SAJIN_CRYPTO_FILE || join(ROOT, 'data', 'crypto.json'));
// 팀마다 비밀번호가 다르다: 팀 비밀번호 파일 = list-passphrase-<팀 이름(공백·특수문자 뺌)>.txt
export const teamFileName = team => `list-passphrase-${String(team || '').replace(/[\\/:*?"<>|()\s]+/g, '') || '팀'}.txt`;
export const passFileFor = team => resolve(process.env.SAJIN_PASSFILE || join(ROOT, teamFileName(team)));

export function fail(msg) { console.error('\n중단: ' + msg); process.exit(1); }
// 저장소 폴더 안쪽인지 (엑셀·목록 파일은 저장소 밖에만 둔다)
export const inRepo = p => (resolve(p).toLowerCase() + sep).startsWith(resolve(ROOT).toLowerCase() + sep);

const howto = file => `팀 비밀번호 파일이 없습니다.
  1) 메모장을 엽니다
  2) 이 팀 비밀번호만 한 줄 입력합니다 (12자 이상, 팀마다 다름)
  3) 「다른 이름으로 저장」 → 위치: sajin-app 폴더, 파일 이름: ${file.split(/[\\/]/).pop()}
  (이 파일은 git에 올라가지 않으며, Claude Code에게 비밀번호를 말할 필요가 없습니다)`;
export function readPass(file) {
  if (!existsSync(file)) fail(howto(file));
  const p = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].trim();
  try { LC.checkPass(p) } catch (e) { fail(e.message + ` (${file})`); }
  return p;
}
// data/crypto.json: {v:2, iter, salts:[{id, salt, createdAt}]} — 솔트는 비밀이 아니며 빌드할 때 앱에 내장된다
export function loadCfg() {
  if (!existsSync(CFGFILE)) fail('data/crypto.json 이 없습니다.');
  const c = JSON.parse(readFileSync(CFGFILE, 'utf8'));
  if (!c.salts || !c.salts.length) fail('data/crypto.json 에 솔트가 없습니다.');
  return c;
}
export function writeCfg(cfg) { mkdirSync(dirname(CFGFILE), { recursive: true }); writeFileSync(CFGFILE, JSON.stringify(cfg, null, 2) + '\n'); }
export function addSalt(cfg) {
  const id = LC.newSaltId(cfg);
  cfg.salts.push({ id, salt: LC.newSalt(), createdAt: LC.isoLocal().slice(0, 10) });
  return id;
}
// 비밀번호 + 파일의 솔트 이름 → 키 (이전 솔트로 만든 파일도 열 수 있음)
export async function keyFor(pass, cfg, saltId) {
  const s = saltId ? LC.saltById(cfg, saltId) : LC.currentSalt(cfg);
  if (!s) fail(`솔트 「${saltId}」를 data/crypto.json 에서 찾을 수 없습니다.`);
  return { key: await LC.deriveKey(pass, s.salt, cfg.iter), saltId: s.id };
}
export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    if (['team-name', 'prev', 'out'].includes(k)) o[k] = argv[++i]; else o[k] = true;
  }
  return o;
}
