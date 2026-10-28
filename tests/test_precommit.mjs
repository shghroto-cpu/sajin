// 커밋 전 검사 테스트: 엑셀·비밀번호 파일·평문 전화번호·대상목록 파일(.sajin, data/lists/)이 막히는지
import assert from 'node:assert/strict';
import { checkFiles } from '../scripts/check_safe_to_commit.mjs';

const f = (path, s) => ({ path, data: Buffer.from(s) });
// 시험용 번호는 조합해서 만든다 (이 파일 자체가 커밋 전 검사에 걸리지 않게)
const MOBILE = ['010', '1234', '5678'].join('-'), LAND = ['031', '123', '4567'].join('-');
const enc = JSON.stringify({ type: 'sajin-list', v: 2, alg: 'AES-256-GCM', kdf: {}, keyCheck: 'CCCC', iv: 'BBBB', ct: 'AAAA' });
const bad = [
  f('대상목록.xlsx', 'PK'), f('docs/목록.xls', 'x'), f('보고서.hwpx', 'PK'), f('a/b.hwp', 'x'),
  f('list-passphrase.txt', 'x'), f('list-passphrase.old.txt', 'x'),
  f('data/lists/team-01.enc', enc), f('data/lists/README.md', 'x'), f('대상목록_3팀_26-4.sajin', enc), f('docs/목록.txt', enc),
  f('src/app.js', `const tel = "${MOBILE}";`), f('docs/a.md', `관리사무소 ${LAND}`),
];
bad.forEach(x => assert.equal(checkFiles([x]).length, 1, '막아야 함: ' + x.path));
const good = [
  f('tests/fixtures/sample_list.xlsx', 'PK'), f('tests/fixtures/sample_list_alias.xlsx', 'PK'),
  f('data/crypto.json', '{"salts":[{"id":"2026A","salt":"x"}]}'),
  f('tests/make_fixture_xlsx.py', "'000-0000-0001', '000-000-0000'"), f('src/app.js', 'const a = 1;'),
  f('index.html', Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(MOBILE)]).toString('latin1')),
];
good.forEach(x => assert.deepEqual(checkFiles([x]), [], '허용해야 함: ' + x.path));
assert.ok(!checkFiles([f('src/app.js', MOBILE)])[0].includes('5678'), '오류 문구에 번호 전체를 쓰지 않음');
console.log('커밋 전 검사 테스트 통과');
