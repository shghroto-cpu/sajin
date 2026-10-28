# CLAUDE.md — 사실관계조사 웹앱 (예전 이름: 현장 사진대지)

이 파일은 Claude Code가 이 저장소에서 작업할 때 먼저 읽는 안내서다.

## 프로젝트 한 줄 요약
국토안전관리원 시설안전평가실 직원이 **관리주체 합동점검(사실관계조사) 현장에서 휴대폰으로 사진을 찍고 설명을 달면**,
기관 양식 그대로의 **한글 보고서(.hwpx)**를 만들어 저장·메일 발송하는 **단일 HTML 웹앱**. GitHub Pages로 배포한다.

## 사용자(담당자) 정보
- 비개발자다. 설명은 **한국어**로, 명령어는 그대로 복사해 쓸 수 있게, 확인 방법(무엇이 보이면 성공인지)을 함께 준다.
- 수정 요청이 오면 **문제된 부분만 고친다.** 전체 재작성 금지.
- 공공기관 업무용이므로 개인정보·사진이 외부로 나가는 기능은 추가하지 않는다.

## 절대 지켜야 할 제약
1. **배포 결과물은 `index.html` 한 파일.** 외부 파일 참조 금지(이미지·CSS·JS 모두 인라인).
   예외: JSZip CDN(`cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1`), Google Fonts.
   **허용 외부 코드 (파일 안에 내장, CDN 금지, 버전 고정 + 라이선스 주석 유지)**: fflate `0.8.2`(MIT), qrcode-generator `1.4.4`(MIT), jsQR `1.4.0`(Apache-2.0).
   `npm install`로 받은 `node_modules`에서 빌드가 넣는다(`scripts/build.mjs`의 `LIBS`, 버전이 다르면 빌드 실패). admin.html 은 jsQR 없이 나머지 둘만.
2. **서버·외부 API 호출 금지.** 사진과 입력값은 휴대폰 브라우저(IndexedDB)에만 저장한다. 분석 도구·로그 수집도 넣지 않는다.
   **대상목록은 외부 서버(GitHub·클라우드)에 두지 않는다 — 기관 메일 첨부(.sajin)로만 전달.** 앱은 목록을 어디서도 받거나 보내지 않는다.
3. **한글 양식 충실도 최우선.** `template/` 데이터는 원본 한글 파일에서 추출한 것이며, 문단 모양·글자 모양 ID(paraPrIDRef, charPrIDRef, borderFillIDRef)를 임의로 바꾸지 않는다.
4. **아이폰 사파리 기준으로 동작 확인.** (아래 "알려진 휴대폰 제약" 참고)
5. `index.html`은 빌드 결과물이다. **직접 수정하지 말고 `src/`를 고친 뒤 빌드**한다.

## 폴더 구조
```
src/
  index.html      화면 뼈대 (/*@@STYLE@@*/, <!--@@SCRIPTS@@--> 자리표시)
  styles.css      화면 디자인 (라이트/다크 모드 색상 변수)
  app.js          화면 동작: 대상 목록 화면, 목록 파일(.sajin) 불러오기·팀 구분, 입력, 사진 처리(4:3 자르기·1600px 축소), IndexedDB 저장, 저장/메일 공유
  admin.html      오프라인 관리 파일 뼈대 → dist/admin.html (JSZip 내장, 웹폰트 없음, 외부 요청 0건)
  xlsxreader.js   .xlsx 읽기 (JSZip + 정규식, DOMParser 없음 → Node에서도 동작)
  importer.js     대상목록 엑셀 행 → 시설물(site) 변환, 다시 불러오기 병합, 바뀐 시설물 비교 (순수 함수)
  listcrypto.js   목록 파일(.sajin) 암호화 (AES-256-GCM, PBKDF2 600,000회, Web Crypto만) — 브라우저·Node 공용
  qrcodec.js      QR 대상목록: 짧은 키 변환·압축 사전·암호화·조각 주소(#q=)·조각 모으기·QR 그림(SVG) — 브라우저·Node 공용
  admin.js        목록 파일 만들기 화면 (dist/admin.html 과 앱의 #admin 이 함께 씀)
  hwpxgen.js      HWPX 생성기: template/의 조각에 값을 채워 section0.xml을 조립하고 zip으로 묶음
template/
  tpl.json        원본 양식에서 잘라낸 XML 조각들({{자리표시}} 포함)
  base.b64        고정 부분(표지 로고, 붙임 그림, header.xml 등)만 담은 기본 패키지(zip, base64)
  source/         원본 한글 양식(.hwpx)을 두는 곳 (용량이 커서 git 제외)
scripts/
  build.mjs             src + template + data/crypto.json(솔트 내장) → index.html, dist/index.html, dist/admin.html
  prepare_template.py   원본 .hwpx → template/tpl.json, base.b64
  listlib.mjs           대상목록 스크립트 공통 (솔트 목록, 비밀번호 파일 읽기, 저장소 안 경로 거부)
  publish_list.mjs      엑셀 → .sajin (엑셀과 같은 폴더 = 저장소 밖, git 작업 없음) (npm run publish-list)
  rotate_passphrase.mjs 모든 팀 키 한꺼번에 교체 = crypto.json 에 새 솔트 추가 (npm run rotate-key). 팀 하나 비밀번호 변경엔 불필요
  check_safe_to_commit.mjs  커밋 전 검사 (.githooks/pre-commit 에서 자동 실행): 엑셀·비밀번호·.sajin·data/lists/·전화번호 차단
data/
  crypto.json           솔트 목록만 (비밀 아님): {v:2, iter, salts:[{id:'2026A', salt}]} — 마지막이 현재 솔트. 빌드 때 앱에 내장
tests/
  make_fixture_xlsx.py  가짜 대상목록 엑셀 생성 (fixtures/sample_list*.xlsx, openpyxl 필요)
  test_importer.mjs     엑셀 읽기·매핑·공유 링크·다시 불러오기 단위 테스트
  test_qrcodec.mjs      QR: 짧은 키 왕복, 시설 수별 QR 장수 측정 표, 조각 섞기·중복, 틀린 비밀번호, QR 그림 → jsQR 판독 왕복
  fake_rows.mjs         QR 테스트용 가짜 목록 행 (무작위 글자)
  test_crypto.mjs       .sajin 암호화·만들기 스크립트·솔트 교체 테스트 (테스트 비밀번호 test-only-passphrase-0000, 임시 폴더만 사용)
  test_precommit.mjs    커밋 전 검사 테스트
  make_fixture_lists.mjs 브라우저 테스트용 .sajin (가짜 1팀·2팀·2팀 새 판) + QR 주소(qr.json)·가짜 카메라 영상(qr_cam.y4m)
  make_sample.mjs       생성기로 tests/out/sample.hwpx, site.hwpx(가짜 엑셀 3번 시설) 생성
  validate_hwpx.py      HWPX 구조 검사 (mimetype, XML 문법, 그림 연결, id 중복, 남은 자리표시)
  e2e_browser.py        (선택) 엑셀 등록·사진·메일/저장 문구·예전 자료 + .sajin 불러오기·팀 구분·갱신 + 오프라인 admin.html (외부 요청 0건)
  fixtures/             테스트용 사진, 가짜 대상목록 엑셀 (실제 엑셀은 절대 넣지 않음)
docs/                   배포 절차(코워크용), 개선 과제, 개발지시서, 대상목록_운영방법.md(담당자용)
index.html              ★ 배포 파일 (GitHub Pages가 이 파일을 서비스). dist/admin.html 은 담당자가 내부망 PC로 반입
```

## 자주 쓰는 명령
```bash
npm install                 # 처음 한 번 (테스트용 jszip 설치)
npm run build               # index.html 다시 만들기
npm test                    # 빌드 + 엑셀 불러오기 테스트 + 샘플 HWPX 생성 + 구조 검사
npm run fixtures            # 가짜 대상목록 엑셀 다시 만들기 (openpyxl)
npm run publish-list -- "<엑셀경로>" --team-name "3팀 (부산권)" [--prev "<이전 .sajin>"] [--txt]   # 목록 파일 만들기
npm run rotate-key          # 모든 팀 키 교체 (새 솔트 추가 → 빌드·배포)
python3 tests/e2e_browser.py   # (선택) 브라우저 흐름 테스트, playwright 필요
npm run template -- template/source/<원본>.hwpx   # 양식이 바뀌었을 때만
```
필요 도구: Node 18+, Python 3 (`pip install lxml pillow openpyxl`, 선택: `pip install playwright && playwright install chromium`)

## 작업 순서 (모든 수정에 공통)
1. `src/` 또는 `scripts/` 수정
2. `npm test` → "검사 통과"가 나와야 함
3. 화면을 바꿨다면 `python3 tests/e2e_browser.py`도 실행하고 `tests/out/screen.png` 확인
4. 커밋 메시지는 한국어로: `수정: 사진 캡션 글자 크기 조정` 형식
5. `git push` → 2~3분 뒤 `https://<아이디>.github.io/sajin/` 반영
6. 담당자에게 **휴대폰에서 새로고침 후 확인할 것**과 **한글에서 열어 확인할 것**을 구분해 안내

## HWPX 생성 구조 (hwpxgen.js)
section0.xml을 아래 순서로 조립한다. 각 조각은 `tpl.json`의 키.
```
secOpen → head(표지~"개 요", {{DATE}})
→ purpose / period / inspectors({{A}} 본문, {{B}} 괄호부분 작은 글씨)
→ h_facility → facility / owner / location → [detail + ftable(K0~K7)] (상세 값이 하나라도 있을 때)
→ h_items → item × N   (항목의 item 값, 없으면 "제목 + 확인")
→ h_result → 항목마다 [secTitle(ㅇ) → opinion(-) × 줄 수 → photoTbl × ⌈사진/2⌉]
→ h_prop → prop(ㅇ) × 줄 수 (첫 줄 뒤에 prop_att1 "붙임1" 문단, state.attach1)
→ 제안 사진 photoTbl → tail(부실예방 참고사항, 붙임1·2) → </hs:sec>
```
- 사진 표: 2행 3열(사진·간격·사진 / 캡션·간격·캡션). 홀수 장이면 오른쪽 칸은 비우되 **사진 칸과 같은 실선 테두리**(photoBorder)를 쓴다 (담당자 요청, 커밋 fa2f8c6).
- 그림 크기 단위: HWPUNIT(1/7200인치). 상자 폭 `picBox[0]`, 높이는 폭×3/4. 원본 크기는 `orgSz = 픽셀×100`, `imgDim = 픽셀×75` (원본 양식 비율을 따름).
- 새 그림은 `BinData/image101.jpg`부터, content.hpf 목록에 `fixedItems` 뒤로 추가.
- `mimetype`은 zip의 **첫 항목, 무압축**. 폴더 항목은 만들지 않는다(`createFolders: false`).
- 바뀐 문단은 `hp:linesegarray`(줄 배치 캐시)를 지운다. 한글이 열 때 다시 계산한다.
- 모든 값은 `esc()`로 XML 이스케이프한다.

## 저장 자료 구조 (IndexedDB `sajindaeji`, v3)
- `kv` 저장소 `appState`: `{v:3, batch:{name, importedAt}|null, activeId, settings:{kindMode:'excel'|'fixed', crop, withPhotos, attach1}, sites:[…]}`
- site(시설물 1곳 = 보고서 1건): `{id, no, buildings, phone, contact, travelers, dateLabel, dateKey, savedAt, edited:[직접 고친 meta 키], managers, removed, src:엑셀 행, meta, sections}`
- `photos` 저장소: 사진 id → `{buf: ArrayBuffer}`. 시설물을 열 때만 그 시설물 사진을 읽는다(`loadPhotos`), 목록으로 나가면 메모리에서 비운다.
- 예전 버전 `draft`(v2)는 처음 열 때 시설물 1건으로 옮기고, `appState` 저장이 성공한 뒤에만 `draft`를 지운다.
- 엑셀 → meta 매핑은 `importer.js`의 `metaFromRow`. 다시 불러오기는 시설물명+날짜로 맞추고 `edited` 항목은 덮어쓰지 않는다.
- 목록 공유 링크는 `#list=`(JSON → JSZip deflate → base64url). **엑셀에서 온 정보만**, 연락처·담당자는 기본 제외. `?` 쿼리에 넣지 말 것.
- 화면에 지도 버튼(네이버지도 검색)은 사용자가 누를 때만 이동한다. 자동 전송 금지.

## 대상목록 = 기관 메일로 보내는 암호화 파일(.sajin) — `docs/대상목록_기관메일배포_전환_개발지시서.md`
- **원칙: 대상목록은 외부 서버(GitHub 포함)에 두지 않는다.** 팀장이 `dist/admin.html`(내부망, 오프라인) 또는 앱 `#admin`에서 `.sajin`을 만들어 기관 메일로 보내고, 실원은 휴대폰에서 「목록 파일 불러오기」.
  (지시서 2의 서버 팀 칸 방식 `data/lists/`는 폐지. 저장소 이력에 올라간 적 없음 — 2026-10-28 확인)
- 파일: `{type:'sajin-list', v:2, alg, kdf:{name, iter, saltId}, keyCheck, iv, ct, createdAt}` — 평문은 createdAt·saltId 뿐. 100KB 이하.
  내용: `{listId, listVersion, team:{name, members}, batch:{id, name, dates}, sites:[importer 행]}`. 같은 목록을 고쳐 다시 보낼 땐 이전 파일로 listId 이어받기(`--prev`, 관리 화면 「이전 목록 파일 불러오기」).
- 암호화: AES-256-GCM, PBKDF2-SHA256 600,000회, 파일마다 IV 새로, `keyCheck`로 틀린 비밀번호 즉시 판별. 비밀번호는 **팀마다 따로**(1팀 비밀번호, 2팀 비밀번호 …), 12자 이상. 관리 화면은 「1. 팀 → 2. 그 팀 비밀번호(두 번) → 3. 엑셀 → 4. 파일·QR」 순서이고, 비밀번호를 아는 팀원이면 누구나 만든다 (이 PC에서 쓴 팀 이름만 localStorage `sajin.teams`에 기억, 비밀번호는 저장 안 함).
  휴대폰 키는 `kv/listKeys` `{솔트 이름:[{key, addedAt}, …]}` — 팀 키 여러 개를 차례로 맞춰 보고, 맞는 키가 없으면 「이 목록의 팀 비밀번호를 입력하세요」. (예전 형식 `{솔트:{key}}`는 읽을 때 배열로 바꿈)
- 솔트는 `data/crypto.json`을 **빌드 때 앱·관리 파일에 내장**(`window.SAJIN_CRYPTO`). 비밀번호 교체 = 새 솔트 추가 → 빌드 → 배포. 이전 솔트는 이전 파일용으로 남김.
- 휴대폰: 비밀번호는 저장하지 않고 솔트별 **추출 불가 CryptoKey**만 IndexedDB `kv/listKeys`에. 현재 솔트 키를 받은 지 2주 지나면 이전 솔트 키 삭제. `app.team = {lists:{listId:…}, myName, nameAsked, chosen}`.
- 병합: listId + 시설물명 + 날짜(`applyListFile`). 같은 listId 새 판은 `edited`·사진 보존·빠진 것 "목록에서 빠짐", 같은 판·옛 판은 무시. 지시서 2 방식으로 받은 시설물(`slot`)은 「이전 방식으로 받은 목록」 표시 후 같은 팀 목록 파일을 열면 이어받음.
- 파일 선택 칸에 `accept`를 넣지 않는다(아이폰에서 .sajin 이 흐리게 막힘). 내용으로 판별: zip이면 엑셀(비상용), `type:'sajin-list'`면 목록, 아니면 "대상목록 파일이 아닙니다".
- 평문 공유 링크(`#list=`)는 폐지 — 열면 미지원 안내만.
- **팀 비밀번호 파일 `list-passphrase-<팀>.txt`(예전 `list-passphrase.txt` 포함)는 Claude Code가 절대 열거나 출력하지 않는다** (cat·Read 금지, 스크립트만 읽음). 비밀번호를 대화·커밋 메시지·로그에 남기지 않는다.

## 대상목록 QR (지시서 4) — `docs/대상목록_QR등록_개발지시서.md`
- 메일 파일 방식은 그대로 두고, 관리 화면 「QR 만들기」로 같은 암호화 목록을 QR 로 보여주거나 인쇄(A4 최대 4장, 「QR만 작게(4cm)」). 인쇄물에 시설물명·주소 글자 없음.
- 주소: `<앱 주소>#q=<번호>.<전체 수>.<묶음 식별값>.<데이터>` — **목록은 # 뒤에만**, `?` 금지. 조각 하나 1,100자 이하(`MAX_URL`), 오류정정 M, 여백 4칸.
  데이터 = base64url([형식 1][솔트 이름 길이][솔트 이름][IV 12][AES-GCM 암호문]). 암호문 안 = fflate deflate(압축 사전 `DICT`) 한 `pack(content)`.
  keyCheck 없음 → 복호화 실패 = 비밀번호 틀림 또는 QR 손상. **`DICT`·짧은 키(`ROW`)를 바꾸면 예전 QR을 못 읽으므로 `VER`를 올린다.**
- 묶음 식별값 = listId 앞 4자 + (listVersion·IV) 해시 3자. 휴대폰은 조각을 IndexedDB `kv/qrParts` `{식별값:{n, parts, at}}`에 모으고 24시간 뒤 지운다.
- 앱은 시작하자마자 `#q=`를 꺼내 `history.replaceState`로 지운 뒤 처리(`bootQr`, hashchange 도 같음). 다 모이면 `openQR` → 키 있으면 바로 `applyListFile`(지시서 3 병합 규칙), 없으면 비밀번호 카드.
- 앱 안 「QR 찍기」(`openScanner`): getUserMedia 후면 카메라 → BarcodeDetector(있으면) 또는 jsQR. 다 모이면 카메라 끄고 등록.
- 삼성 인터넷 등으로 열렸고 이 브라우저에 시설물·키가 없으면 「평소 쓰는 브라우저인가요?」 안내 + 「여기에 그냥 등록」.
- 측정(가짜 목록): 10곳 이하 1장, 20·30곳 2장 (연락처 포함·제외 모두). `node tests/test_qrcodec.mjs` 가 표를 출력.

### 담당자가 "대상목록 파일 만들어줘 (엑셀 경로, 팀 이름)"라고 하면
1. 엑셀이 저장소 폴더 **밖**에 있는지 확인 (안이면 옮겨 달라고 안내)
2. `npm run publish-list -- "<경로>" --team-name "…"` (같은 목록 갱신이면 `--prev "<이전 .sajin>"`, 메일이 .sajin 을 막으면 `--txt`) → 미리보기를 보여주고 **확인**받기 (`--dry-run`으로 먼저 미리보기 가능)
3. 만들어진 파일 경로(엑셀과 같은 폴더)를 알려주고 "기관 메일에 첨부해 팀원에게 보내세요. 비밀번호는 메일에 적지 마세요" 안내
- **git 작업 없음.** `.sajin`·엑셀은 절대 커밋하지 않는다(훅이 막음). `git add -A`, `git add .` 금지 — 파일을 하나씩 지정해서 add.
- 팀 비밀번호 파일: `list-passphrase-<팀 이름에서 공백·괄호 등 뺌>.txt` (예: 「1팀 (부산권)」 → `list-passphrase-1팀부산권.txt`). 없으면 스크립트가 만들 파일 이름을 안내.
- 팀 하나 비밀번호 변경: 담당자가 그 팀 파일을 새 비밀번호로 다시 저장하면 끝 (배포 불필요).
- 모든 팀 키 교체(드묾): `npm run rotate-key` → `npm run build` → `git add data/crypto.json index.html` → 커밋 → push

## 알려진 휴대폰 제약 (중요)
- **아이폰은 한 번 누를 때 파일을 하나만 내려받는다.** 저장은 항상 zip 하나(보고서 + `사진/` 폴더)로 만든다.
- **IndexedDB에 Blob을 그대로 넣으면 아이폰에서 깨질 수 있다.** 사진은 `{buf: ArrayBuffer}`로 저장한다(`putPhoto`, `toFreshBlob`).
- **공유창(navigator.share)은 터치 직후에만 열린다.** 파일 생성이 길면 막히므로 첫 터치에 파일을 만들어 두고(`prepared`), 막히면 버튼을 "준비 완료 · 눌러서 보내기"로 바꿔 두 번째 터치에 연다.
- **브라우저가 .hwpx 공유를 거부할 수 있다**(canShare=false). 이때는 zip을 내려받고 위치를 안내한다.
- **카메라 앱으로 QR을 찍으면 기종에 따라 다른 브라우저(삼성 인터넷 등)로 열릴 수 있다** → 저장 공간이 달라 목록이 따로 생김. 앱 안 「QR 찍기」를 권장.
- **기관 메일 앱은 공유 창에 나타나지 않는다** (담당자 확인 2026-10-28). 실원은 사파리로 기관 웹메일에 들어가 첨부한다 → 「파일 저장 (메일 첨부용)」이 주 버튼, 「공유」는 보조. 안내 문구도 "파일 앱 › 다운로드 → 사파리 웹메일 첨부" 기준.
- **카카오톡·네이버 등 앱 안 브라우저**는 저장/공유가 막힌다 → 사용자 에이전트로 감지해 "다른 브라우저로 열기" 안내.
- claude.ai 아티팩트로 열면 `window.claude.use('downloads')` 경로를 쓰며 .hwpx 확장자는 저장 불가(zip만 가능). GitHub Pages 배포본에서는 해당 없음.

## 양식이 바뀌었을 때
1. 새 한글 파일을 `template/source/`에 둔다 (git에는 올라가지 않음)
2. `npm run template -- template/source/<파일명>.hwpx`
3. 오류가 나면 메시지의 "기준 문구"가 원본에 있는지 확인 (prepare_template.py 상단 주석)
4. `npm test` → 담당자에게 샘플(`tests/out/sample.hwpx`)을 한글에서 열어보게 요청

## 하지 말 것
- index.html 직접 편집, 외부 서버 전송 코드, 추적/분석 스크립트 추가
- 비밀번호 파일 열기·출력, 대상목록(.sajin·엑셀)을 저장소·외부 서버에 두기, 목록을 서버에서 받는 기능 추가, `git add -A`/`git add .`
- 개인정보(이름·연락처)를 기본값으로 코드에 넣기, **실제 대상목록 엑셀·실명·전화번호 커밋** (`.gitignore`가 `*.xlsx`를 막음, 가짜 `tests/fixtures/sample_list*.xlsx`만 예외)
- 저장소를 Private으로 바꾸기(무료 Pages 중단), 다른 저장소 변경
- 담당자 확인 없이 양식 문구(붙임, 참고사항) 수정
