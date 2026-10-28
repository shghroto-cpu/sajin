// 팀 비밀번호 교체: data/crypto.json 에 새 솔트(새 이름)를 추가한다. 이전 솔트는 이전 목록 파일을 열 수 있도록 남긴다.
// 사용: (list-passphrase.txt 에 새 비밀번호를 저장한 뒤) npm run rotate-key → npm run build → 커밋·배포
import { readPass, loadCfg, writeCfg, addSalt } from './listlib.mjs';

readPass();                       // 새 비밀번호 파일이 있고 12자 이상인지만 확인 (내용은 쓰지 않음)
const cfg = loadCfg();
const id = addSalt(cfg);
writeCfg(cfg);
console.log(`새 솔트 「${id}」를 추가했습니다 (솔트 ${cfg.salts.length}개). 이제 새로 만드는 목록 파일은 새 비밀번호를 씁니다.`);
console.log('다음 순서: npm run build → git add data/crypto.json index.html → 커밋 → git push (앱 배포)');
console.log('휴대폰은 새 목록 파일을 처음 열 때 새 비밀번호를 한 번 묻고, 이전 키는 2주 뒤 자동으로 지웁니다.');
console.log('새 비밀번호는 구두 또는 내부 메신저로만 전달하세요. 메일 본문에 적지 마세요.');
