# 개발지시서 5: 화면(UI) 디자인 개선 — KALIS 디자인 지침 적용 (기능 변경 없음)

> **Claude Code에게:** `CLAUDE.md`를 먼저 읽고, 이 문서와 `docs/KALIS_UI_디자인지침.md`(기관 공통 디자인 지침 원문)를 함께 읽어 줘.
> 이번 작업은 **보이는 모습만 바꾸는 작업**이다. 기능·저장 자료 구조·한글(HWPX) 출력·암호화·QR 형식은 **하나도 바꾸지 않는다.**
> 디자인 지침 원문은 **PC용 내부 도구** 기준이다. 이 앱은 **휴대폰(아이폰 사파리) 앱**이므로, 이 문서의 「모바일 적용판」이 원문보다 우선한다.
> 담당자는 비개발자다. 단계가 끝날 때마다 **바뀌기 전·후 화면 캡처를 나란히** 보여 주고, 한국어로 무엇이 바뀌었는지 짧게 설명해 줘.
> 이 파일은 `docs/UI_디자인_개선_작업지시서.md`에 두고, 맨 아래 「작업 기록」에 진행 상황을 남겨 줘.

---

## 0. 절대 규칙 (이번 작업 한정 추가)

1. **고쳐도 되는 파일:** `src/styles.css`, `src/index.html`, `src/admin.html`, `scripts/build.mjs`(글꼴 내장 부분만), `src/app.js`·`src/admin.js`의 **화면 그리기 코드**(클래스 추가, 아이콘, 감싸는 요소, 화면 문구 일부), `package.json`(글꼴 패키지 추가), `CLAUDE.md`(디자인 규칙 반영), `tests/e2e_browser.py`(캡처 추가만).
2. **손대지 않는 파일:** `src/hwpxgen.js`, `src/importer.js`, `src/listcrypto.js`, `src/qrcodec.js`, `src/xlsxreader.js`, `template/`, `data/`, `scripts/publish_list.mjs`·`rotate_passphrase.mjs`·`listlib.mjs`·`check_safe_to_commit.mjs`.
3. **동작 로직 불변:** 저장(`persist`), 사진 처리, 공유/저장(`prepared` 2단계 터치 포함), 목록 병합, 키 처리, QR 받기는 그대로. 버튼을 옮기더라도 **같은 id·같은 이벤트 연결**을 유지한다.
4. **아래 선택자·문구는 테스트(`tests/e2e_browser.py`)가 쓰므로 이름을 바꾸지 않는다.** 클래스를 **추가**하는 것은 괜찮다.
   - id: `#backBtn #resetBtn #setBtn #hdrSub #batchName #batchCount #listInfo #qrBtn #listFileBtn #manualBtn #remoteBox #lmsg #siteList #otherTeams #clearListBtn #metaBox #metaForm #sections #addSecBtn #bar #cnt #saveBtn #mailBtn #msg #copyToBtn #fileIn #listIn #dlg #sheet #passIn #nameIn` 및 관리 화면의 `#adm…` 전부
   - class: `.site .site-open .state(.doing .done) .tag .tag.alert .day .empty .keycard .pick .qrprog .ph .add .ptitle .warnbox .plist .admprev .others .msg .err .ppage .qrno`
   - 버튼 문구: 「확인」「건너뛰기」「선택한 팀 목록 보기」「여기에 그냥 등록」「등록」「이 목록 지우기」「QR 찍기」「목록 파일 불러오기」「파일 저장 (메일 첨부용)」「공유」
   - 화면 문구: 「팀 비밀번호를 입력하세요」「이 목록의 팀 비밀번호」「…개 시설」「사진 n장」「저장함」「이전 방식으로 받은 목록」「기관 웹메일」 등 테스트가 확인하는 문장은 그대로 둔다.
5. **인쇄 화면(`.ppage`, `@media print`)과 QR 그림(흰 바탕·여백)은 바꾸지 않는다.** 인쇄 품질과 판독률이 우선이다.
6. **사진 미리보기(`.ph`)의 「보고서 모양」(검은 실선 테두리, 명조 캡션)은 유지한다.** 실제 한글 보고서와 같은 모습을 미리 보여 주는 장치이기 때문이다. 번호·안내 표시만 덧붙인다.
7. 작업은 새 브랜치 `ui-refresh`에서 한다. **`main`에 합치고 push 하는 것은 담당자가 캡처를 보고 「좋다」고 한 뒤**에만 한다. (push 하면 바로 실원 휴대폰에 반영되기 때문)
8. 시작 전에 `git status`를 확인한다. 커밋 안 된 변경(예: `index.html`, `package-lock.json`)이 있으면 **무엇인지 담당자에게 알리고** 먼저 정리 방법을 물어본다.

---

## 1. 지금 화면의 문제 (진단 결과)

`tests/out/screen_*.png` (390px 폭) 캡처를 보고 정리했다.

| 위치 | 문제 | 개선 방향 |
|---|---|---|
| 상단 바 | 형광 연두(#D4F000) 사선 줄무늬가 공사장 표지처럼 보이고 기관 CI와 무관 | KALIS 남색→파랑 그라데이션 앱 바, 줄무늬 삭제 |
| 상단 바 (편집 화면) | 「← 목록」「사실관계조사」「보고서 비우기」 세 개가 한 줄에 몰려 제목이 가운데로 밀림. 삭제성 버튼이 엄지 닿는 위치에 있음 | 왼쪽 정렬 제목 + 뒤로 버튼만 남기고, 「보고서 비우기」는 편집 화면 맨 아래로 이동 |
| 상단 바 (목록) | 「⋯」 버튼이 무엇인지 알기 어려움 | 톱니 아이콘 + 「설정」 글자 |
| 주 버튼 색 | 「파일 저장」만 형광 연두, 나머지 주 버튼은 남색 → 색 규칙이 둘 | 모든 주 버튼 = 남색(`--navy-deep`) 한 가지 |
| 목록 상단 | 「목록 파일 불러오기」가 두 줄로 꺾임 | 아이콘 + 한 줄 글자 타일, 줄바꿈 금지 |
| 안내 글씨 | 설명문이 12px 회색이라 현장(야외)에서 읽기 어려움 | 최소 13px, 본문 안내 14~15px, 색은 `--soft` 이상 진하게 |
| 시설물 카드 | 상태(사진 0장/작성 중/저장함)가 회색 글자뿐이라 진행 상황이 한눈에 안 보임 | 상태를 색 배지(회색/파랑/초록)로 |
| 안전등급 | D만 빨강, 나머지는 모두 같은 회색 테두리 | 등급별 고정 색 (A 초록 · B 파랑 · C 남색 · D·E 빨강) |
| 하단 바 메시지 | 저장 후 긴 안내문이 하단 바 안에서 늘어나 **입력 칸과 사진을 가림** | 하단 바 높이만큼 본문 아래 여백 자동 확보 + 메시지를 알림 상자로 |
| 항목 카드 | ↑ ↓ ✕ 버튼 색이 주황·파랑으로 제각각, ↑ 비활성 상태가 거의 안 보임 | 같은 모양의 아이콘 버튼, 삭제만 빨강 |
| 의견 입력칸 | 제목(라벨) 없이 안내문(placeholder)만 있어 입력하면 무슨 칸인지 사라짐 | 칸 위에 「현장 확인 의견」 라벨 |
| 사진 | 설명을 안 넣은 사진이 구분되지 않음, 순서 번호 없음 | 왼쪽 위 번호, 설명 없는 사진에 금색 「설명 입력」 표시 |
| 글꼴 | Google Fonts(IBM Plex Sans KR)를 인터넷으로 받음 → 느린 망에서 늦게 뜨고, 외부 요청 1건 | Pretendard를 파일 안에 내장 (외부 요청 감소) |
| 관리 화면(PC) | 머리글과 본문 폭이 어긋나고, 단계 제목 「1. 팀」이 본문과 구분이 약함 | 앱 바 64px, 단계 번호 원형 배지, 폭 정렬 |

---

## 2. 디자인 지침 적용 범위

| 지침 항목 (원문 §) | 이 앱에서 | 비고 |
|---|---|---|
| §3 브랜드 색 | **그대로 적용** | 다크 모드용 값은 이 문서 §3에서 추가 정의 |
| §4 글꼴 Pretendard 내장, 굵게 | **적용 (모바일 크기)** | 「본문 굵게」 토글은 넣지 않음 (기본을 충분히 굵게) |
| §5 앱 바·패널·카드 | **모바일에 맞게 변형** | 앱 바 56px, 본문 최대폭 720px 유지 |
| §5 필터 레일·오른쪽 서랍(560px)·관리 표 | **적용 안 함** | 휴대폰 화면에 맞지 않음. 기존 하단 시트(`dialog`) 유지 |
| §6 버튼·태그·배지·카드·모달 | **적용** | 하단 시트에 손잡이 표시, 터치 높이 44~52px |
| §6 토스트 | **이번엔 적용 안 함** | 테스트가 `#msg` 문구를 읽으므로 알림 상자 방식으로 대체 |
| §6 빈 화면 = 마스코트 + 다음 할 일 | **적용** | 마스코트는 §7 조건부 |
| §7 삭제는 휴지통·되돌리기 | **이번엔 적용 안 함** | 기능 변경이라 범위 밖. §11 후속 과제로 기록 |
| §8 마스코트 | **조건부 적용** | 담당자가 `character.png`를 넣었을 때만 |
| §9 문구 | **일부 적용** | 테스트가 쓰는 문구는 유지, 나머지만 다듬기 |
| §10 접근성 (포커스, 대비, 움직임 줄이기) | **적용** | |
| §2 「CDN 금지」 | **일부 적용** | 글꼴은 내장으로 바꿈. JSZip CDN 은 이번엔 유지(§11 후속 과제) |

---

## 3. 디자인 토큰 (`src/styles.css` 맨 위 `:root` 교체)

```css
:root{
  /* KALIS CI 고정색 (docs/KALIS_UI_디자인지침.md §3) */
  --navy-deep:#00307C; --navy:#004098; --blue:#007AC3; --green:#00873B; --green-light:#8FC43E;
  --gold:#C8B05A; --gold-ink:#8C7424; --error:#C0392B; --hl:#FFE27A;
  /* 등급·종별 고정색 — 다크 모드에서도 바꾸지 않음 (흰 글자 대비 4.5:1 이상) */
  --g-a:#00873B; --g-b:#007AC3; --g-c:#004098; --g-alert:#C0392B;
  /* 화면 역할 (라이트) */
  --bg:#F3F6FA; --panel:#FFFFFF; --field:#F7F9FC;
  --line:#DCE3ED; --line2:#EDF1F7; --tint:#EEF4FC;
  --ink:#1C2733; --ink2:#3B4A5C; --soft:#5B6B7D;
  --primary:var(--navy-deep); --primary-hover:var(--navy); --on-primary:#FFFFFF;
  --accent:var(--blue);
  --ok-bg:#E6F4EC; --ok-ink:#00672D;
  --warn-bg:#FBF5DF; --warn-ink:#6B5718;
  --err-bg:#FBECEA; --err-ink:#A93226;
  --appbar:linear-gradient(115deg,#00307C 0%,#004098 55%,#007AC3 100%);
  --shadow:0 1px 2px rgba(0,48,124,.06),0 4px 14px rgba(0,48,124,.07);
  --r-card:12px; --r-btn:10px;
  --bar-h:0px;            /* 하단 바 실제 높이 (JS가 넣음, §6.6) */
  color-scheme:light;
  /* 아래 safe-area 설정은 기존 그대로 유지 */
}
/* 다크 모드: 기존 방식(@media + :root:not([data-theme="light"]), :root[data-theme="dark"]) 그대로 두 곳에 같은 값 */
  --bg:#0C1522; --panel:#142132; --field:#1A2A3E;
  --line:#2A3C53; --line2:#1F3045; --tint:#183252;
  --ink:#E7EEF6; --ink2:#C2CFDD; --soft:#9BADC2;
  --primary:#2A64C4; --primary-hover:#3470D2; --on-primary:#FFFFFF;
  --accent:#5DB4EE; --blue:#5DB4EE; --gold-ink:#E2C873; --error:#F08A73;
  --ok-bg:#12352A; --ok-ink:#7FDDA6; --warn-bg:#3A3110; --warn-ink:#F1DB8C; --err-bg:#3D1C18; --err-ink:#F6A796;
  --appbar:linear-gradient(115deg,#061E4A 0%,#0A2D66 55%,#0B4F80 100%);
  --shadow:0 1px 2px rgba(0,0,0,.45);
  color-scheme:dark;
```

**옛 변수 정리** (교체 후 `grep -n "var(--vis\|var(--surface\|var(--danger" src/styles.css` 결과가 0줄이어야 함)

| 옛 변수 | 쓰이던 곳 | 새 값 |
|---|---|---|
| `--surface` | 카드·시트 바탕 | `--panel` |
| `--vis` / `--vis-ink` | 저장 버튼, 「오늘」 표시, 안내 상자 테두리, QR 받은 번호 | 저장 버튼 → `--primary` / 「오늘」 → `--gold` 바탕 + `--ink` 글자 / 안내·QR 상자 테두리 → `--accent` / QR 받은 번호 → `--green` 바탕 + 흰 글자 |
| `--danger` | 삭제 글자, D·E 등급 | 글자 → `--error`, 등급 바탕 → `--g-alert` |
| `--ink` (머리글 바탕·주 버튼 바탕 용도) | 머리글, `.btn.primary`, 카드 번호 | 머리글 → `--appbar`, 주 버튼·번호 → `--primary` |
| `--ink` (사진 칸 테두리) | `.ph` | **그대로 `--ink`** (보고서 모양 유지) |

---

## 4. 글꼴: Pretendard 내장 (Google Fonts 제거)

1. `npm install --save-dev --save-exact pretendard@1.3.9` (라이선스 OFL-1.1)
2. 사용할 파일 (KS X 1001 한글 2,350자 + 영문·기호 서브셋, 각 약 270KB):
   `node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Medium.subset.woff2` (500),
   `…/Pretendard-Bold.subset.woff2` (700)
3. `scripts/build.mjs`에 `FONTS` 를 `LIBS`와 같은 방식으로 추가: **버전이 1.3.9가 아니면 빌드 실패**, base64로 읽어 `@font-face` 두 개를 만들고 CSS **앞에** 붙인다. 라이선스 주석 `/*! Pretendard 1.3.9 | SIL OFL 1.1 | github.com/orioncactus/pretendard */` 유지. `font-display:swap`.
   - `index.html`과 `dist/admin.html` **둘 다** 넣는다 (관리 파일은 원래 웹폰트가 없었으므로 이제 PC에서도 같은 모양이 된다).
4. `src/index.html`에서 Google Fonts `<link rel="preconnect">` 2줄과 `<link href="https://fonts.googleapis.com/…">` 1줄 **삭제**.
5. `body{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",system-ui,sans-serif}`
   - 서브셋에 없는 드문 글자(예: 일부 고어·특수 한자)는 휴대폰 기본 글꼴로 자동 대체되므로 문제없다.
   - 사진 캡션(`.ph .cap`)의 명조체(`"Batang","Noto Serif KR",serif`)는 **그대로** 둔다.
6. `CLAUDE.md` 「절대 지켜야 할 제약 1」의 예외 목록에서 **Google Fonts 삭제**, 허용 내장 목록에 **Pretendard 1.3.9(OFL)** 추가.
7. 빌드 결과 크기를 작업 기록에 남긴다 (예상: `index.html` 약 +0.7MB). **5MB를 넘으면 멈추고 담당자에게 알린다.**

**글자 크기 (휴대폰 기준)**

| 용도 | 크기 / 굵기 |
|---|---|
| 앱 바 제목 | 18px / 700 |
| 앱 바 부제 | 13px / 500 |
| 화면 제목·카드 제목(시설물명, 항목 제목) | 17px / 700 |
| 날짜 묶음 머리 | 17px / 700 |
| 본문·입력칸 | 16px / 500 (입력칸은 **16px 미만 금지** — 아이폰 자동 확대 방지) |
| 라벨·버튼 | 15px / 700 |
| 보조 설명 (`.sub`) | 14px / 500, 색 `--soft` |
| 최소 크기 | 13px (배지·태그) — 12px 이하 금지 |

- 한글 줄바꿈 `word-break:keep-all; overflow-wrap:anywhere;` 를 `body`에.
- 제목·라벨·버튼·숫자는 700, 긴 설명문은 500.

---

## 5. 공통 부품

**아이콘:** 외부 아이콘 묶음을 쓰지 않는다. `app.js` 위쪽에 `const ICON = { camera, qr, file, phone, map, gear, back, up, down, trash, check, lock, plus, chev }` 형태로 **직접 그린 단순 SVG 문자열**(viewBox 24, `stroke="currentColor"`, 선 굵기 2, `aria-hidden="true"`)을 두고, 버튼에 `아이콘 + 글자`로 넣는다. 아이콘만 있는 버튼은 `aria-label` 필수(기존 값 유지).
- 버튼 글자를 `textContent`로 넣는 `btn()` 함수는 그대로 두고, 아이콘이 필요한 곳만 `b.prepend(svg 요소)` 하는 작은 도우미를 추가한다 (테스트가 `has-text("확인")` 으로 찾으므로 글자는 그대로 남아야 함).

**버튼**
- `.btn` 높이 48px(작은 `.btn.sm` 40px), 모서리 10px, 글자 15px/700, 아이콘과 글자 사이 6px, `white-space:nowrap`.
- 주 버튼 `.btn.primary`, `.save`: 바탕 `--primary`, 글자 흰색. 누를 때 `--primary-hover` + `transform:scale(.98)`.
- 보조 버튼 `.btn`, `.mail`: 흰 바탕(`--panel`) + `--line` 테두리, 글자 `--ink`. 누를 때 테두리·글자 `--accent`.
- 위험 버튼 `.btn.danger`, `.dangertxt`: 보조 버튼 모양 + 글자 `--error`. 누를 때 바탕 `--err-bg`.
- `:disabled` 은 `opacity:.4` + 회색 테두리 (지금보다 뚜렷하게).
- 글자형 버튼 `.linkbtn`: 밑줄 없이 `--accent` 700, 터치 영역 최소 40px 높이.

**입력칸:** 높이 48px, 테두리 1.5px `--line`, 바탕 `--field`, 포커스 시 테두리 `--accent` + `box-shadow:0 0 0 3px rgba(0,122,195,.18)`. 라벨 `label.f`는 14px/700, 색 `--ink2`, 칸과 간격 6px.

**카드(`.block`):** 바탕 `--panel`, 테두리 `--line`, 모서리 12px, 그림자 `--shadow`, 카드 사이 12px.

**태그·배지**
- `.tag`: 13px/700, 높이 24px, 모서리 6px, `white-space:nowrap`.
- 안전등급(`src.safetyGrade`): 바탕색 고정 + 흰 글자. A `--g-a`, B `--g-b`, C `--g-c`, D·E `--g-alert` (D·E는 기존처럼 `.tag.alert` 클래스도 함께 붙임). 등급 클래스 `.grade-a`…`.grade-e`를 추가해 색을 준다.
- 종별(`meta.grade`, 「1종/2종/3종」): **테두리만** 있는 태그. 1종 `--g-c`, 2종 `--g-b`, 3종·기타 `--g-a` 색 테두리·글자 (등급과 헷갈리지 않게 속이 빈 모양).
- 팀 이름 `.tag.team`: `--tint` 바탕 + `--accent` 글자.
- 「목록에서 빠짐」: `--err-bg` 바탕 + `--err-ink` 글자.

**상태 배지 (시설물 카드의 `.state`)** — 문구는 그대로, 모양만:
- 사진 없음: `--line2` 바탕 + `--soft` 글자 「사진 0장」
- `.doing`(사진 있음, 저장 전): `--tint` 바탕 + `--accent` 글자 「사진 n장」 앞에 작은 점
- `.done`(저장함): `--ok-bg` 바탕 + `--ok-ink` 글자, 앞의 「✓」는 CSS `::before` 유지 또는 체크 아이콘

**알림 상자(`.msg`가 비어 있지 않을 때)**
```css
.msg:empty{display:none}
.msg:not(:empty){background:var(--tint);color:var(--ink);border-left:4px solid var(--accent);
  border-radius:8px;padding:10px 12px;font-size:14px;line-height:1.55}
.msg.err:not(:empty){background:var(--err-bg);color:var(--err-ink);border-left-color:var(--error)}
```
- 단, 관리 화면·키 카드 안의 `.msg`도 같은 모양이 되므로 화면별로 어색하지 않은지 캡처로 확인한다.

**하단 시트(`dialog`)**: 위쪽 모서리 18px, 맨 위 가운데 회색 손잡이(폭 40px·높이 4px, `.sheet::before`), 안쪽 여백 20px, 요소 간격 14px. 배경 어둡게 `rgba(5,15,30,.55)`.

**포커스:** `outline:3px solid rgba(0,122,195,.45); outline-offset:2px;` (모든 버튼·입력·summary)

**움직임:** 버튼 눌림·시트 열림에만 120~180ms. `prefers-reduced-motion` 이면 없음(기존 규칙 유지).

---

## 6. 화면별 개선

### 6.1 앱 바 (`header.top`) — 목록·편집 공통
- 바탕 `--appbar`, 높이 56px(+ 위쪽 safe-area), **`position:sticky; top:0; z-index:20`** — 긴 편집 화면에서도 「목록」 버튼에 바로 닿게.
- 사선 줄무늬 `.stripe` 는 **표시하지 않는다** (`display:none`. 요소는 남겨도 됨).
- `body::before`(아이폰 상단 상태표시줄 영역) 색 = `#00307C` (다크 모드 `#061E4A`).
- 배치: `[‹ 목록] [제목·부제 (왼쪽 정렬, 줄임표)] [설정]`
  - `#backBtn`: 왼쪽 꺾쇠 아이콘 + 「목록」, 흰 글자, 반투명 흰 테두리 `rgba(255,255,255,.45)`, 높이 40px.
  - `#setBtn`: 톱니 아이콘 + 「설정」 글자 (`aria-label="설정"` 유지).
  - 부제 `#hdrSub`: 13px, `#CFE0F5`, 한 줄 줄임표.
- `#resetBtn`(보고서 비우기)은 **앱 바에서 빼서 편집 화면 맨 아래**(「점검 항목 추가」 아래, 버전 문구 위)로 옮긴다. id·클릭 연결은 그대로. 모양은 위험 버튼(전체 폭), 글자 「이 보고서 비우기」 앞에 휴지통 아이콘. `showView()` 의 `hidden` 처리 코드는 그대로 동작해야 한다.

### 6.2 대상 목록 화면 (`#listView`)
`renderList()` 끝에서 `$('#listView').classList.toggle('has-list', shown.length > 0)` 한 줄만 추가하고, 나머지는 CSS로 나눈다.

**(가) 목록이 없을 때 (`:not(.has-list)`) — 시작 화면**
- `.lhead` 를 그라데이션 「시작 카드」로: 바탕 `--appbar`, 흰 글자, 모서리 16px.
  - 맨 위 제목(새 요소 `.hero-q`, 20px/700): 「오늘 점검할 대상 목록을 불러올까요?」 (`#batchName` 은 그대로 두되 이 상태에선 숨김)
  - 버튼 두 개(`#qrBtn`, `#listFileBtn`)는 **흰 바탕 정사각형 타일**: 위에 아이콘 28px, 아래 글자 16px/700, 남색 글자, 높이 96px, 줄바꿈 금지.
  - 설명 `.sub` 는 15px, `rgba(255,255,255,.85)`.
  - `#manualBtn` 은 반투명 흰 테두리 버튼 「직접 입력해서 시작」.
  - 마스코트가 있으면(§7) 카드 오른쪽 아래 72px.
- `.empty`(안내 카드): 제목 17px/700, 단계 목록 `.steps` 는 **번호 동그라미(남색 24px 원 + 흰 숫자)** 로 — 실제 순서가 있는 내용이므로 번호 사용이 맞다. 글자 15px.

**(나) 목록이 있을 때 (`.has-list`) — 작고 단정하게**
- `.lhead` 는 흰 카드. 첫 줄 `#batchName` 17px/700 + `#batchCount` 를 금색 글자(`--gold-ink`) 700으로.
- `#qrBtn`·`#listFileBtn` 은 높이 48px **보조 버튼**(아이콘 + 한 줄 글자)으로 낮춘다 — 목록이 이미 있으면 주 행동은 「시설물 고르기」이기 때문. `#manualBtn` 은 글자형 버튼.
- 설명 `.sub` 는 이 상태에서 숨긴다 (처음 한 번 읽으면 되는 문장).

**(다) 날짜 묶음 머리 `.day`**
- 17px/700 `--ink`, 개수 `span` 은 `--gold-ink` 700.
- 「오늘」(`.today`): `--gold` 바탕 + `--ink` 글자, 13px/700, 둥근 배지.
- 개수 옆에 **「저장 n/m」** 를 덧붙인다 (그 날짜의 시설물 중 `savedAt` 있는 수 / 전체). 화면 표시만 추가, 데이터 변경 없음. 모두 저장하면 초록 글자.
- 위쪽 여백 24px, 아래 8px.

**(라) 맨 아래 「목록 비우기」(`#clearListBtn`)**: 위쪽 32px 띄우고 위험 버튼(테두리형). 그 아래 저장 위치 안내·버전 문구는 13px `--soft`.

### 6.3 시설물 카드 (`siteCard()`)
```
┌───────────────────────────────────────┐
│ [3] 마바아파트                [3종][D] › │  ← 번호 배지(남색) · 이름 17px/700 · 태그 · 꺾쇠
│     가상도 가상시 나상구 나상동 3 · 3개동 · 오전 │  ← 14px --soft, 한 줄 줄임표
│     (✓ 저장함 · 사진 1장)  담당 홍길동        │  ← 상태 배지 + 담당
├───────────────────────────────────────┤
│                      [☎ 전화] [⌖ 지도]  │  ← 위쪽 1px --line2 구분선, 버튼 40px
└───────────────────────────────────────┘
```
- 카드 전체(`.site-open`)가 눌리는 영역임을 알 수 있게 오른쪽 끝에 꺾쇠 아이콘(`--soft`)을 넣는다.
- 번호 `.st1 .no`: 26px 정사각형, `--primary` 바탕.
- 카드를 누르는 순간 테두리 `--accent` (`:active`).
- 저장한 카드(`s.savedAt`)는 왼쪽에 4px 초록 띠(`box-shadow: inset 4px 0 0 var(--green)`), 작성 중은 파란 띠 — `article` 에 `is-done`/`is-doing` 클래스 추가.
- `.removed`: 점선 테두리 + `opacity:.75` 유지.
- 전화·지도·삭제 버튼에 아이콘. 지도 버튼의 `href`·`target`·`rel` 은 절대 바꾸지 않는다(사용자가 누를 때만 이동).

### 6.4 비밀번호·이름·팀 선택 카드 (`.keycard`, `.pick`)
- 카드: 흰 바탕, 위쪽 4px `--accent` 띠, 제목 앞 자물쇠 아이콘(비밀번호 카드만), 제목 18px/700.
- 비밀번호 입력 + 「확인」 한 줄(`.inrow`): 높이 48px, 입력칸 2 : 버튼 1 유지.
- 「취소」 글자형 버튼은 가운데.
- 팀 고르기 `.pick`: 높이 56px 이상 카드형, 체크되면 `:has(input:checked)` 로 테두리 `--accent` + 바탕 `--tint`.
- QR 받는 중 `.qrprog`: 받은 번호 배지 `.got` = `--green` 바탕 흰 글자, 안 받은 번호 = 점선 테두리.
- 다른 브라우저 안내 카드도 같은 `.keycard` 모양.

### 6.5 편집 화면 (`#editView`)
**기본정보 `#metaBox`**
- `summary`: 17px/700, 왼쪽에 문서 아이콘, 오른쪽에 「펼치기/접기」 글자(기존 `::after`) + 꺾쇠가 열릴 때 180° 회전.
- 시설물명(`facility`)이 비어 있으면 summary 오른쪽에 금색 배지 「시설물명 미입력」 (`renderMeta()`/`updateHeader()`에서 클래스만 토글).
- 입력 양식: 라벨 14px/700, 칸 48px, 2열(420px 이하 1열, 기존 규칙 유지). 체크 항목 `.check` 는 24px 체크박스 + 15px 글자, 줄 간격 12px.

**점검 항목 카드 `.sec`**
- 머리 `.sec-head`: 기호(ㅇ/□)를 28px 원형 배지(`--tint` 바탕, `--primary` 글자)로. 제목 textarea 17px/700.
- ↑ ↓ ✕ 를 같은 모양 아이콘 버튼(40px, 테두리 `--line`, 아이콘 `--ink2`)으로: 위·아래 꺾쇠 아이콘, 삭제는 휴지통 아이콘 + `--error` 색. 비활성은 `opacity:.3`.
- 의견 textarea 위에 라벨 「현장 확인 의견」(제안 카드는 「제안 내용」) 14px/700 추가. placeholder 문구는 그대로.
- 제안 카드(`type === 'proposal'`): 왼쪽 4px `--gold` 띠 + 제목 옆 「별도 장」 금색 테두리 태그. 안내문 `.kind` 는 `--warn-bg` 상자, 14px.

**사진 격자 `.grid` / `.ph`** (보고서 모양 유지)
- 각 사진 왼쪽 위에 순서 번호 배지(`.ph .n`, 22px, `--primary` 바탕 흰 글자, `position:absolute`) — `.ph` 에 `position:relative` 추가.
- 설명(`p.desc`)이 없는 사진: `.ph` 에 `need-desc` 클래스 → 캡션 아래 금색 글자 「눌러서 설명 입력」(13px/700, `--gold-ink`). **보고서(HWPX)에는 영향 없음** — `captionHTML()` 의 화면 표시만.
- 캡션 글자 12px → **13px** (명조 유지).
- 「＋ 사진 촬영·추가」(`.add`): 높이 56px, 2px 점선 `--accent`, 바탕 `--tint`, 카메라 아이콘 + 16px/700. 처리 중(`.busy`)은 점선 회색 + 글자 `--soft`.

**아래쪽**
- 「＋ 점검 항목 추가」(`#addSecBtn`): 보조 버튼(전체 폭, 48px, 플러스 아이콘).
- 그 아래 `#resetBtn`(§6.1에서 옮겨 온 것), 32px 띄움.

### 6.6 하단 바 (`#bar`) — 가림 문제 해결
- 구성: `[사진 n장] [파일 저장 (메일 첨부용) — 주 버튼] [공유 — 보조]`
  - `.count`: 「사진」 13px `--soft`, 숫자 `#cnt` 20px/700.
  - `#saveBtn`: 주 버튼(`--primary`), 높이 52px, 저장 아이콘 + 글자. 「준비 완료 · 눌러서 보내기」 등 **JS가 바꾸는 글자는 그대로**.
  - `#mailBtn`: 보조 버튼 52px, 공유 아이콘 + 「공유」.
- 바탕 `--panel` + 위쪽 그림자 `0 -4px 16px rgba(0,48,124,.08)`.
- **가림 방지:** `app.js` 에 `ResizeObserver` 로 `#bar` 높이를 재서 `document.documentElement.style.setProperty('--bar-h', h + 'px')` 하고, CSS 에서 `#editView{padding-bottom:calc(var(--bar-h) + 24px)}`. 메시지가 길어져도 내용이 바 뒤로 숨지 않는다.
- `#msg` 는 하단 바 안 버튼 **위쪽**으로 옮기고(같은 `.bar` 안에서 순서만 변경) §5 알림 상자 모양 + `max-height:30vh; overflow:auto`. `#copyToBtn` 줄도 그 아래 유지.
- 목록 화면의 `#lmsg` 도 같은 알림 상자 모양(목록 위쪽).

### 6.7 사진 편집 시트 (`openSheet()`)
- 미리보기 `.prev`: 모서리 10px, 최대 높이 36vh, 위에 「n번째 사진 / 전체 m장」 13px 표시(화면 표시만).
- 「사진 제목」·「설명」·「들어갈 항목」 라벨 14px/700, 칸 48px.
- 단어 칩 `.chips`: 묶음 이름(「부재」「손상·상태」)은 13px/700 `--ink2`, 칩 높이 38px·글자 15px, 누른 순간 `--tint` 바탕. 「지우기」 칩은 `--error` 글자.
- 「← 앞으로」「뒤로 →」: 보조 버튼, 비활성 시 뚜렷하게 흐림.
- 맨 아래 「사진 삭제」(위험) · 「완료」(주) 한 줄, **시트 아래쪽에 붙어 있게**(`position:sticky; bottom:0; background:var(--panel); padding-top:10px`).

### 6.8 설정 시트 (`#setBtn` 클릭)
- 제목 「설정」 19px/700.
- 묶음별 소제목(13px/700 `--soft`): 「내 정보」 / 「보고서 받을 메일」 / 「불러온 목록」 / 「초기화」.
- 「이 휴대폰에서 대상 목록·키 모두 지우기」는 맨 아래 위험 버튼, 위쪽 24px 띄움.

### 6.9 목록 미리보기 시트 (`showPreview()`)
- 제목 `.ptitle` 19px/700. 목록 `.plist` 줄 높이 44px, 번호 `--soft`, 시설물명 16px/700, 날짜·등급 14px.
- 등급 글자에도 §5 등급 색을 작은 점(8px 원)으로 앞에 표시.
- 「확인이 필요한 칸」 `.warnbox`: `--warn-bg` + 왼쪽 4px `--gold` 띠 + `--warn-ink` 글자, 제목 700.
- 「취소」(보조) · 「등록」(주) 버튼 52px.

### 6.10 QR 찍기 시트 (`openScanner()`)
- 영상 모서리 12px, 가운데에 반투명 흰 사각 틀(가이드, CSS 겹침 요소). 상태 문구 15px/700.
- 「닫기」 보조 버튼 전체 폭.

### 6.11 관리 화면 (`dist/admin.html`, 앱 `#admin` 공용, PC 중심)
- 앱 바: 높이 64px, `--appbar`, 제목 「사실관계조사」 18px/700 + 부제. `header.top .inner` 최대폭을 본문과 같게(`#adminView` 960px).
- 각 단계 카드 `.adm` 제목 `h3`(「1. 팀」「2. … 비밀번호」「3. 엑셀」「4. 목록 파일 또는 QR 만들기」): 앞의 숫자를 **남색 원형 배지(28px)** 로 보이게 한다. 방법은 문구를 바꾸지 말고 `h3` 에 `data-step` 을 넣어 `::before` 로 그리거나, 숫자 부분만 `span.step` 으로 감싼다 (테스트가 `「4팀 (시험권) 비밀번호」` 문구를 확인하므로 글자는 유지).
- 「목록 파일 만들기」·「QR 만들기」 두 주 버튼은 같은 높이 52px로 나란히.
- 안내 카드 `.guide`, QR 카드 `.qrview` 의 형광 테두리 → `--accent` 2px.
- 미리보기 표 `.plist` 는 PC에서 2열 격자(900px 이상)로 보기 좋게.
- **인쇄용(`.ppage`, `@media print`)은 바꾸지 않는다.**

### 6.12 다크 모드
- §3 다크 값으로 모든 화면 캡처(`*_dark.png`)를 다시 확인. 흰 글자가 밝은 바탕에 올라가는 곳이 없는지, QR 바탕이 흰색으로 남아 있는지 확인.

---

## 7. 마스코트 (조건부)

- 담당자가 `assets/character.png`(기관 공식 캐릭터, 투명 바탕)를 저장소에 넣은 경우에만 사용한다. **없으면 마스코트 없이 진행하고, 끝날 때 「캐릭터 그림을 `assets/character.png`로 넣어 주시면 시작 화면에 넣겠습니다」라고 안내**한다.
- 빌드가 파일이 있을 때만 base64 로 읽어 `window.SAJIN_MASCOT` 데이터 주소로 넣는다 (없으면 빈 값 → 화면에서 자리 자체를 만들지 않음).
- 쓰는 곳: 시작 카드(§6.2 가) 오른쪽 아래 72px, 빈 안내 카드 위 64px. **다른 곳에는 넣지 않는다.** 다시 그리거나 색을 바꾸지 않는다 (크기 조절만).
- 넣기 전에 PNG 용량을 확인하고 300KB 넘으면 가로 256px로 줄인 사본을 빌드에 쓴다(원본은 그대로).
- 공식 캐릭터는 공개 저장소에 올라가게 되므로, **넣기 전에 담당자에게 「공개 저장소에 올라가도 되는지」 한 번 확인**한다.

---

## 8. 작업 순서와 커밋 단위

각 단계 끝마다: `npm test` → `python3 tests/e2e_browser.py` → 캡처 비교 → 커밋 (`git add` 는 파일을 하나씩 지정).

| 단계 | 내용 | 커밋 메시지 예 |
|---|---|---|
| 0 | `git status` 확인, 브랜치 `ui-refresh` 생성, **바뀌기 전 캡처**: e2e 실행 후 `tests/out/*.png` 를 `tests/out/before/` 로 복사, 샘플 HWPX 의 `Contents/section0.xml` 을 `tests/out/before/section0.xml` 로 보관 | (커밋 없음) |
| 1 | §3 디자인 토큰 교체 + 옛 변수 정리 (모양 변화가 가장 큰 단계) | `디자인: KALIS 색 체계 적용` |
| 2 | §4 Pretendard 내장, Google Fonts 제거, 글자 크기 정리 | `디자인: Pretendard 글꼴 내장, 글자 크기 정리` |
| 3 | §5 공통 부품 + 아이콘 | `디자인: 버튼·입력칸·태그·아이콘 정리` |
| 4 | §6.1 앱 바, §6.2~6.4 목록 화면 | `디자인: 앱 바와 대상 목록 화면 개선` |
| 5 | §6.5~6.7 편집 화면·하단 바(가림 해결)·사진 시트 | `디자인: 편집 화면·하단 바 가림 해결` |
| 6 | §6.8~6.12 설정·미리보기·QR·관리 화면·다크 모드 | `디자인: 설정·관리 화면·다크 모드 정리` |
| 7 | §7 마스코트(파일 있을 때), `VERSION` 올리기(예: `2026.11.xx-UI`), `CLAUDE.md` 갱신(§10) | `디자인: 마스코트·버전·안내서 갱신` |

---

## 9. 검증 (모두 통과해야 담당자에게 보고)

1. `npm test` → 「검사 통과」.
2. `python3 tests/e2e_browser.py` → 모든 확인 통과, 페이지 오류 0건. **테스트를 통과시키려고 테스트 기대값을 고치지 않는다.** (캡처 추가는 가능)
3. **한글 출력 불변:** 단계 0에 보관한 `section0.xml` 과 지금 `node tests/make_sample.mjs` 결과의 `section0.xml` 을 비교해 **날짜 자리 외에는 같아야** 한다. 다르면 즉시 멈추고 원인 보고.
4. **외부 요청:** e2e 의 요청 목록에서 `fonts.googleapis.com`·`fonts.gstatic.com` 이 **사라졌는지** 확인. 새 외부 주소가 생기면 안 된다 (`cdnjs` JSZip 1건만 남음). `dist/admin.html` 은 기존대로 외부 요청 0건.
5. **글꼴 적용:** 브라우저에서 `document.fonts.check('700 16px Pretendard')` 가 `true`.
6. **폭별 캡처:** 360px(작은 안드로이드), 390px(아이폰), 430px(큰 아이폰) × 라이트/다크 × [시작 화면, 목록, 비밀번호 카드, 편집 화면, 저장 직후(긴 메시지), 사진 시트, 설정 시트, 미리보기 시트] + 관리 화면 1280px. 결과를 `tests/out/after/` 에.
   - 확인할 것: 버튼 글자 두 줄 꺾임 없음, 가로 스크롤 없음, **저장 직후 메시지가 입력칸·사진을 가리지 않음**, 12px 이하 글자 없음.
7. **대비:** 토큰 조합(글자색/바탕색)을 계산하는 짧은 스크립트로 본문 글자 4.5:1 이상, 큰 글자·배지 3:1 이상인지 확인해 표로 작업 기록에 남긴다.
8. **크기:** `index.html`·`dist/admin.html` 크기 전후 비교를 작업 기록에 남긴다.
9. 바뀌기 전·후 캡처를 **같은 화면끼리 좌우로 붙인 비교 그림**(`tests/out/compare_*.png`)을 만들어 담당자에게 보여 준다.

---

## 10. 담당자 안내 (작업이 끝나면 이 형식으로)

1. **PC에서 먼저 보기:** 비교 그림(`tests/out/compare_*.png`)을 보여 주고 「이대로 휴대폰에 반영할까요?」 확인.
2. 승인하면: `ui-refresh` → `main` 합치기 → `git push` → 2~3분 뒤 반영.
3. **휴대폰 확인 순서** (사파리에서 앱 주소 열고 새로고침):
   - [ ] 위쪽이 남색 띠로 바뀌고 형광 줄무늬가 없어졌다
   - [ ] 대상 목록의 카드에 등급 색·상태 배지가 보이고, 기존 목록·사진이 **그대로 있다**
   - [ ] 시설물을 눌러 사진 1장 추가 → 사진 왼쪽 위 번호, 설명 없으면 「눌러서 설명 입력」 표시
   - [ ] 「파일 저장」 → 안내 문구가 떠도 아래 입력칸이 가려지지 않는다
   - [ ] 받은 zip 안의 한글 파일을 PC에서 열었을 때 **예전과 똑같다** (양식 변화 없음)
   - [ ] 다크 모드(설정 › 디스플레이)에서도 글자가 잘 보인다
4. 이상하면 「어느 화면에서, 무엇이」 캡처와 함께 알려 주면 그 부분만 고친다.

`CLAUDE.md` 에는 다음을 추가한다:
- 「화면 디자인 규칙」 절: §3 토큰 표, 주 버튼은 남색 한 가지, 등급 고정색, 최소 글자 13px·입력칸 16px, 아이콘은 직접 그린 SVG, 인쇄·QR·사진 미리보기 모양은 고정.
- 글꼴 내장 예외 변경(§4-6).

---

## 11. 후속 과제 (이번 범위 아님 — `docs/개선과제.md` 에 추가만)

1. **삭제 되돌리기:** 사진·시설물·항목 삭제를 휴지통 방식으로 바꾸고 「되돌리기」 알림(8초) 제공 (디자인 지침 §7). 저장 구조가 바뀌므로 별도 지시서로.
2. **JSZip 내장:** 지금 유일하게 남는 외부 요청(cdnjs JSZip)을 관리 파일처럼 파일 안에 내장 → 앱의 외부 요청 0건 (보안 설명에 유리).
3. **토스트 알림:** 테스트를 함께 고쳐 짧은 알림은 화면 아래 토스트로, 긴 안내만 알림 상자로.
4. **작성 진행률:** 시설물 카드에 「의견 n/m 항목 작성」 같은 진행 표시.

---

## 작업 기록
- (Claude Code가 단계별로 날짜·결과·크기·특이사항을 적는다)
- **2026-10-28 0단계**: `git status` 깨끗함 (지시서 문서 2개만 새 파일). 브랜치 `ui-refresh` 생성. 바뀌기 전 캡처 `tests/out/before/` (e2e 캡처 + `tests/ui_shots.py` 폭 360·390·430 × 라이트·다크 8화면 + 관리 화면 1280), `section0.xml` 보관. 크기: index.html 3,563,745 B, dist/admin.html 261,121 B
  - 한글 출력 비교: 생성기가 표·그림 `id`·`instid`·`zOrder`를 실행마다 무작위로 만들므로 그 숫자만 빼고 비교 (나머지 완전히 같아야 함)
- **1단계 (색 체계)**: §3 토큰으로 교체, 옛 변수(`--vis`·`--surface`·`--danger`) 0건. 머리글 그라데이션·줄무늬 숨김, 주 버튼(저장 포함) 남색 한 가지, 「오늘」 금색, D등급 `--g-alert`, QR 받은 번호 초록. 테스트 통과, 한글 section0.xml 같음
- **2단계 (글꼴)**: Pretendard 1.3.9 서브셋 500·700 내장 (`scripts/build.mjs` `FONTS`, 버전 다르면 빌드 실패), Google Fonts 3줄 삭제. `document.fonts.check('700 16px Pretendard')` = true (앱·관리 파일 모두). 앱 외부 요청은 cdnjs JSZip 1건만, 관리 파일 0건. 글자 크기 표대로 정리 (화면 글자 12px 이하 0건, 인쇄용 `.ppage` 제외), 제목·라벨·버튼 700
  - 크기: index.html 3,565,062 → 4,284,160 B (+0.69MB), dist/admin.html 262,438 → 981,788 B
- **3단계 (공통 부품)**: 버튼(주 남색·보조 테두리·위험 빨간 글자, 48px·작은 40px, 줄바꿈 금지, 비활성 .4), 입력칸 48px·포커스 테두리, 카드 그림자, 태그(등급 고정색 `.grade-a…e`, 종별 테두리 `.jong-1…3`, 팀 `--tint`, 「목록에서 빠짐」 `.gone`), 상태 배지 3색, 알림 상자(`.msg:not(:empty)`), 하단 시트 손잡이·여백
  - 아이콘: `app.js` 의 `ICON`(직접 그린 SVG) → 버튼에 `data-icon` → CSS `::before` 마스크로 그림. 지시서의 `prepend` 대신 이 방식을 쓴 이유: 저장·공유·사진 추가 버튼은 실행 중에 JS가 `textContent` 를 바꾸므로 넣어 둔 아이콘 요소가 지워짐. 아이콘은 `data:` 주소라 외부 요청 없음
  - 「받는 주소 복사」 감싼 줄은 빈 알림 상자가 보이지 않도록 `.msg` → `.msgline` (테스트는 `#copyToBtn` 만 씀)
- **4단계 (앱 바·목록)**: 앱 바 그라데이션·위에 붙음(sticky)·「‹ 목록」「⚙ 설정」 아이콘+글자, 「보고서 비우기」는 편집 화면 맨 아래 「이 보고서 비우기」(위험 버튼, 같은 id·같은 클릭 연결)로 이동. 목록 없을 때 시작 카드(질문 제목 + 흰 타일 2개, 줄바꿈 없음), 있을 때 흰 카드 + 보조 버튼. 날짜 머리에 「저장 n/m」, 카드에 꺾쇠·저장/작성 중 왼쪽 띠, 단계 안내 번호 동그라미, 비밀번호 카드 자물쇠·위쪽 띠, 팀 고르기 선택 표시, QR 안 받은 번호 점선
