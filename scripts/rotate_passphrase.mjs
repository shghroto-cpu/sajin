// 모든 팀 키 한꺼번에 바꾸기: data/crypto.json 에 새 솔트(새 이름)를 추가한다. 이전 솔트는 이전 목록 파일을 열 수 있도록 남긴다.
// 팀 하나의 비밀번호만 바꿀 때는 필요 없다 (새 비밀번호로 만들면 휴대폰이 새 비밀번호를 한 번 묻는다).
// 사용: npm run rotate-key → npm run build → 커밋·배포
import { loadCfg, writeCfg, addSalt } from './listlib.mjs';

const cfg = loadCfg();
const id = addSalt(cfg);
writeCfg(cfg);
console.log(`새 솔트 「${id}」를 추가했습니다 (솔트 ${cfg.salts.length}개). 이제 새로 만드는 목록 파일은 모든 팀이 새 키를 씁니다 (팀 비밀번호는 그대로 써도 됨).`);
console.log('다음 순서: npm run build → git add data/crypto.json index.html → 커밋 → git push (앱 배포)');
console.log('휴대폰은 새 목록 파일을 처음 열 때 팀 비밀번호를 한 번 다시 묻고, 이전 키는 2주 뒤 자동으로 지웁니다.');
console.log('새 비밀번호는 구두 또는 내부 메신저로만 전달하세요. 메일 본문에 적지 마세요.');
