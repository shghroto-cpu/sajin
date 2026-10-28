# CLAUDE.md — 현장 사진대지 웹앱

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
2. **서버·외부 API 호출 금지.** 사진과 입력값은 휴대폰 브라우저(IndexedDB)에만 저장한다. 분석 도구·로그 수집도 넣지 않는다.
3. **한글 양식 충실도 최우선.** `template/` 데이터는 원본 한글 파일에서 추출한 것이며, 문단 모양·글자 모양 ID(paraPrIDRef, charPrIDRef, borderFillIDRef)를 임의로 바꾸지 않는다.
4. **아이폰 사파리 기준으로 동작 확인.** (아래 "알려진 휴대폰 제약" 참고)
5. `index.html`은 빌드 결과물이다. **직접 수정하지 말고 `src/`를 고친 뒤 빌드**한다.

## 폴더 구조
```
src/
  index.html      화면 뼈대 (/*@@STYLE@@*/, <!--@@SCRIPTS@@--> 자리표시)
  styles.css      화면 디자인 (라이트/다크 모드 색상 변수)
  app.js          화면 동작: 대상 목록 화면, 입력, 사진 처리(4:3 자르기·1600px 축소), IndexedDB 저장, 저장/메일 공유, 목록 공유
  xlsxreader.js   .xlsx 읽기 (JSZip + 정규식, DOMParser 없음 → Node에서도 동작)
  importer.js     대상목록 엑셀 행 → 시설물(site) 변환, 다시 불러오기 병합, 공유 링크 압축 (순수 함수)
  hwpxgen.js      HWPX 생성기: template/의 조각에 값을 채워 section0.xml을 조립하고 zip으로 묶음
template/
  tpl.json        원본 양식에서 잘라낸 XML 조각들({{자리표시}} 포함)
  base.b64        고정 부분(표지 로고, 붙임 그림, header.xml 등)만 담은 기본 패키지(zip, base64)
  source/         원본 한글 양식(.hwpx)을 두는 곳 (용량이 커서 git 제외)
scripts/
  build.mjs             src + template → index.html (+ dist/index.html)
  prepare_template.py   원본 .hwpx → template/tpl.json, base.b64
tests/
  make_fixture_xlsx.py  가짜 대상목록 엑셀 생성 (fixtures/sample_list*.xlsx, openpyxl 필요)
  test_importer.mjs     엑셀 읽기·매핑·공유 링크·다시 불러오기 단위 테스트
  make_sample.mjs       생성기로 tests/out/sample.hwpx, site.hwpx(가짜 엑셀 3번 시설) 생성
  validate_hwpx.py      HWPX 구조 검사 (mimetype, XML 문법, 그림 연결, id 중복, 남은 자리표시)
  e2e_browser.py        (선택) 엑셀 등록→시설물별 사진→메일 공유·저장→공유 링크→예전 자료 옮기기
  fixtures/             테스트용 사진, 가짜 대상목록 엑셀 (실제 엑셀은 절대 넣지 않음)
docs/                   배포 절차(코워크용), 개선 과제
index.html              ★ 배포 파일 (GitHub Pages가 이 파일을 서비스)
```

## 자주 쓰는 명령
```bash
npm install                 # 처음 한 번 (테스트용 jszip 설치)
npm run build               # index.html 다시 만들기
npm test                    # 빌드 + 엑셀 불러오기 테스트 + 샘플 HWPX 생성 + 구조 검사
npm run fixtures            # 가짜 대상목록 엑셀 다시 만들기 (openpyxl)
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

## 알려진 휴대폰 제약 (중요)
- **아이폰은 한 번 누를 때 파일을 하나만 내려받는다.** 저장은 항상 zip 하나(보고서 + `사진/` 폴더)로 만든다.
- **IndexedDB에 Blob을 그대로 넣으면 아이폰에서 깨질 수 있다.** 사진은 `{buf: ArrayBuffer}`로 저장한다(`putPhoto`, `toFreshBlob`).
- **공유창(navigator.share)은 터치 직후에만 열린다.** 파일 생성이 길면 막히므로 첫 터치에 파일을 만들어 두고(`prepared`), 막히면 버튼을 "준비 완료 · 눌러서 보내기"로 바꿔 두 번째 터치에 연다.
- **브라우저가 .hwpx 공유를 거부할 수 있다**(canShare=false). 이때는 zip을 내려받고 위치를 안내한다.
- **카카오톡·네이버 등 앱 안 브라우저**는 저장/공유가 막힌다 → 사용자 에이전트로 감지해 "다른 브라우저로 열기" 안내.
- claude.ai 아티팩트로 열면 `window.claude.use('downloads')` 경로를 쓰며 .hwpx 확장자는 저장 불가(zip만 가능). GitHub Pages 배포본에서는 해당 없음.

## 양식이 바뀌었을 때
1. 새 한글 파일을 `template/source/`에 둔다 (git에는 올라가지 않음)
2. `npm run template -- template/source/<파일명>.hwpx`
3. 오류가 나면 메시지의 "기준 문구"가 원본에 있는지 확인 (prepare_template.py 상단 주석)
4. `npm test` → 담당자에게 샘플(`tests/out/sample.hwpx`)을 한글에서 열어보게 요청

## 하지 말 것
- index.html 직접 편집, 외부 서버 전송 코드, 추적/분석 스크립트 추가
- 개인정보(이름·연락처)를 기본값으로 코드에 넣기, **실제 대상목록 엑셀·실명·전화번호 커밋** (`.gitignore`가 `*.xlsx`를 막음, 가짜 `tests/fixtures/sample_list*.xlsx`만 예외)
- 저장소를 Private으로 바꾸기(무료 Pages 중단), 다른 저장소 변경
- 담당자 확인 없이 양식 문구(붙임, 참고사항) 수정
