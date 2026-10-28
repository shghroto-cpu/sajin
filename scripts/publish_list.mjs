// 대상목록 엑셀 → 암호화 목록 파일(.sajin). 파일은 엑셀과 같은 폴더(저장소 밖)에 만들고, git 작업은 하지 않는다.
// 사용: npm run publish-list -- "<엑셀경로>" --team-name "3팀 (부산권)" [--prev "<이전 .sajin>"] [--no-contacts] [--no-travelers] [--txt] [--out "<폴더>"]
//   --prev : 같은 팀·같은 회차 목록을 다시 보낼 때. listId 를 이어받아 휴대폰에서 「갱신」으로 처리됨
//   --txt  : 기관 메일이 .sajin 첨부를 막으면 .txt 로 저장
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { I, X, LC, JSZip, fail, readPass, passFileFor, loadCfg, keyFor, inRepo, parseArgs } from './listlib.mjs';

const a = parseArgs(process.argv.slice(2));
if (a.team || a.clear) fail('--team, --clear 는 더 이상 쓰지 않습니다 (서버 팀 칸 방식 폐지). --team-name 만 넣어 주세요.');
if (!a._[0]) fail('엑셀 파일 경로를 넣어 주세요.');
const xlsx = resolve(a._[0]);
if (inRepo(xlsx)) fail('엑셀을 sajin-app 폴더 밖으로 옮겨 주세요. (예: 바탕화면) 저장소 안에 두면 실수로 공개될 수 있습니다.');
if (!existsSync(xlsx)) fail(`엑셀 파일을 찾을 수 없습니다: ${xlsx}`);
const outDir = resolve(a.out || dirname(xlsx));
if (inRepo(outDir)) fail('목록 파일은 sajin-app 폴더 밖에 만들어야 합니다. --out 에 다른 폴더를 넣어 주세요.');

// 1) 엑셀 읽기 (앱과 같은 xlsxreader + importer)
let parsed;
try { parsed = I.parseWorkbook((await X.readXlsx(readFileSync(xlsx), JSZip)).sheets); } catch (e) { fail(e.message); }
const teamName = String(a['team-name'] || '').trim();
if (!teamName) fail('--team-name 에 팀 이름을 넣어 주세요. (예: --team-name "3팀 (부산권)")');
console.log(`\n[미리보기] ${teamName}`);
console.log(`회차: ${parsed.name} · ${parsed.rows.length}곳`);
parsed.rows.forEach(r => console.log(`  ${String(r.no).padStart(2)}. ${r.facility}  ${I.dayLabel(r.dateKey)}${r.ampm ? ' ' + r.ampm : ''}`));
if (parsed.warnings.length) { console.log('확인이 필요한 칸:'); parsed.warnings.forEach(w => console.log('  ! ' + w)); }
if (a['no-travelers']) console.log('주의: --no-travelers → 출장자 이름이 빠져 휴대폰에서 이름으로 팀을 자동 구분할 수 없습니다 (팀 선택 화면으로 고름).');
if (a['no-contacts']) console.log('연락처·담당자는 넣지 않습니다.');

// 2) 그 팀 비밀번호(list-passphrase-<팀>.txt)·키 (지금 쓰는 솔트)
const pass = readPass(passFileFor(teamName));
const cfg = loadCfg();
const { key, saltId } = await keyFor(pass, cfg);

// 3) 이전 목록 파일이 있으면 listId 이어받기 + 바뀐 시설물 표시
let listId;
if (a.prev) {
  const pf = resolve(a.prev);
  if (!existsSync(pf)) fail(`이전 목록 파일을 찾을 수 없습니다: ${pf}`);
  let old;
  try { old = JSON.parse(readFileSync(pf, 'utf8').replace(/^﻿/, '')); } catch (e) { fail('이전 목록 파일이 손상되었습니다.'); }
  if (!LC.isEncFile(old)) fail('이전 목록 파일이 대상목록 파일(.sajin) 형식이 아닙니다.');
  let oc;
  try { oc = await LC.decryptList((await keyFor(pass, cfg, old.kdf.saltId)).key, old); } catch (e) { fail(`이전 목록 파일이 ${teamName} 비밀번호로 열리지 않습니다. 다른 팀 목록 파일인지 확인하세요.`); }
  listId = oc.listId;
  const d = I.diffRows(I.cleanRows(oc.sites), parsed.rows);
  console.log(`이전 목록(${oc.team.name}, ${oc.listVersion})을 이어받습니다 → 휴대폰에서 「갱신」으로 처리됩니다.`);
  console.log(`  추가 ${d.added.length}곳${d.added.length ? ': ' + d.added.join(', ') : ''}`);
  console.log(`  빠짐 ${d.removed.length}곳${d.removed.length ? ': ' + d.removed.join(', ') : ''}`);
  console.log(`  바뀜 ${d.changed.length}곳${d.changed.length ? ': ' + d.changed.join(', ') : ''}`);
}
if (a['dry-run']) { console.log('\n(--dry-run: 파일을 만들지 않았습니다)'); process.exit(0); }

// 4) 암호화 → 다시 풀어서 같은지 확인한 뒤에만 저장
const content = LC.makeContent({ listId, teamName, name: parsed.name, rows: parsed.rows,
  withContact: !a['no-contacts'], withTravelers: a['no-travelers'] ? false : true });
const file = await LC.encryptList(key, content, { iter: cfg.iter, saltId });
if (JSON.stringify(await LC.decryptList(key, JSON.parse(JSON.stringify(file)))) !== JSON.stringify(content)) fail('암호화 검증에 실패했습니다. 파일을 만들지 않았습니다.');
const text = JSON.stringify(file) + '\n';
if (Buffer.byteLength(text) > LC.MAX_BYTES) fail(`목록 파일이 너무 큽니다 (${Math.round(Buffer.byteLength(text) / 1024)}KB > 100KB). 엑셀을 팀별로 나눠 주세요.`);
const out = join(outDir, LC.fileName(content, a.txt ? 'txt' : 'sajin'));
writeFileSync(out, text);
console.log(`\n목록 파일을 만들었습니다 (복호화 검증 통과, ${(Buffer.byteLength(text) / 1024).toFixed(1)}KB):`);
console.log(`  ${out}`);
console.log('이 파일을 기관 메일에 첨부해 팀원에게 보내세요. 비밀번호는 메일에 적지 마세요 (구두·내부 메신저로).');
