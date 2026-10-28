// 커밋 전 검사: 엑셀·한글·비밀번호 파일, 대상목록 파일(.sajin, data/lists/), 평문 전화번호가 스테이징되면 막는다
// 대상목록은 외부 서버(GitHub)에 두지 않는다 — 기관 메일로만 전달
// 사용: npm run precommit (git pre-commit 훅에서 자동 실행)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PHONE = /0\d{1,2}-\d{3,4}-\d{4}/g;
const fakePhone = s => /^000-0000-\d{4}$/.test(s) || !/[1-9]/.test(s);   // 테스트용 가짜 번호는 허용
const isText = buf => !buf.subarray(0, 8000).includes(0);

export function checkFiles(files) {
  const errors = [];
  for (const f of files) {
    const p = f.path.replace(/\\/g, '/'), base = p.split('/').pop();
    if (/\.(xlsx|xls|hwp|hwpx)$/i.test(p) && !/^tests\/fixtures\/sample_list[^/]*\.xlsx$/.test(p))
      errors.push(`엑셀·한글 파일은 올릴 수 없습니다: ${p}`);
    if (/^list-passphrase.*\.txt$/i.test(base)) errors.push(`비밀번호 파일은 올릴 수 없습니다: ${p}`);
    if (/^data\/lists\//.test(p) || /\.sajin$/i.test(p)) { errors.push(`대상목록 파일은 저장소에 올릴 수 없습니다 (기관 메일로만 전달): ${p}`); continue; }
    if (isText(f.data)) {
      if (/"type"\s*:\s*"sajin-list"/.test(f.data.subarray(0, 200).toString('utf8'))) { errors.push(`대상목록 파일은 저장소에 올릴 수 없습니다 (기관 메일로만 전달): ${p}`); continue; }
      const hits = [...new Set(f.data.toString('utf8').match(PHONE) || [])].filter(s => !fakePhone(s));
      if (hits.length) errors.push(`전화번호로 보이는 값이 있습니다: ${p} (${hits.length}건, 예: ${hits[0].replace(/\d{4}$/, '****')})`);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const git = (...a) => execFileSync('git', a, { maxBuffer: 1 << 28 });
  const names = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR').toString('utf8').split('\0').filter(Boolean);
  const errors = checkFiles(names.map(path => ({ path, data: git('show', ':' + path) })));
  if (errors.length) {
    console.error('커밋을 멈췄습니다 (공개 저장소 보호):');
    errors.forEach(e => console.error('  - ' + e));
    console.error('해당 파일을 빼려면: git restore --staged "<파일>"');
    process.exit(1);
  }
  console.log(`커밋 전 검사 통과 (${names.length}개 파일)`);
}
