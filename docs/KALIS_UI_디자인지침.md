# KALIS Internal Tool — UI/UX Design Instructions

> 국토안전관리원 내부 도구 공통 디자인 지침 (원문). PC용 기준이며, 사실관계조사 앱(휴대폰)에는 `docs/UI_디자인_개선_작업지시서.md`의 「모바일 적용판」이 우선한다.

Apply these rules to every internal tool built for this user (국토안전관리원 / KALIS). The reference implementation is **"조문 검색 프로그램"** (a law-article search tool). New tools should look and behave like a sibling of it. All on-screen text must be in **Korean**; these instructions are in English only for clarity.

---

## 1. Context you must always assume

- The user works at a Korean public institution on an **air-gapped internal network** (Windows PCs, Edge/Chrome, Hancom Hangul). No internet at runtime.
- The user is **non-technical**. Deliverables must run by double-clicking. Explain setup step by step with visual checkpoints ("if you see X, it worked").
- **Never** load anything from a CDN, web font service, or external URL. Every library, font, image, and icon must be inlined into the deliverable.
- Before building, ask about anything ambiguous that would change the result (who uses it, file formats, must-have features). Ask at most 3 questions, with tappable options when possible.

## 2. Delivery format

- **Default: one self-contained `.html` file** (all CSS/JS/fonts/images inlined, base64 where needed). Name the file with the Korean program name the user chose (e.g. `조문 검색 프로그램.html`).
- Use Electron (`electron-builder`, target `dir`, never `portable`) only when the tool must control local programs (e.g. Hangul COM automation) or the file system beyond file pickers.
- Libraries used in the HTML (e.g. pdf.js 3.x UMD, SheetJS, fflate) are pasted inline. Web workers are created from a `<script type="text/plain">` block turned into a Blob URL. Escape `</script` inside inlined code.
- Persist data in **IndexedDB** (works on `file://`). Wrap every storage call in try/catch; if storage fails, run in memory and show a yellow banner telling the user to export a backup.
- Always provide **Backup / Share**: export everything as one `.json` file, and import it (merge or replace). This is also the path to team sharing later (put the backup on a shared folder).

## 3. Brand tokens (from the official KALIS CI)

```css
:root{
  --navy-deep:#00307C;   /* main: app bar, primary buttons, titles */
  --navy:#004098;        /* hover / secondary navy */
  --blue:#007AC3;        /* accent, focus, links */
  --green:#00873B;       /* success, "external" links, "latest" pills */
  --green-light:#8FC43E; /* gradients only */
  --gold:#C8B05A;        /* counts, badges, highlights, undo button */
  --gold-ink:#8C7424;    /* gold used as text (readable) */
  --bg:#F3F6FA;          /* page background */
  --panel:#FFFFFF;       /* cards/panels */
  --line:#DCE3ED; --line2:#EDF1F7; --tint:#EEF4FC;
  --ink:#1C2733; --ink2:#3B4A5C; --soft:#5B6B7D;
  --error:#C0392B;       /* functional only, never decorative */
  --hl:#FFE27A;          /* search-hit highlight */
  --shadow:0 1px 2px rgba(0,48,124,.06),0 4px 14px rgba(0,48,124,.07);
}
```

- When items belong to ordered categories (e.g. legal hierarchy, severity, grade), give each category a fixed color from the navy → blue → green → gold range and use it consistently for tags, left borders, filter dots, and section headers.
- Gradients appear only in the app bar and the home hero: `linear-gradient(115deg, #00307C 0%, #004098 55%, #007AC3 100%)`.

## 4. Typography

- Font: **Pretendard**, embedded as base64 WOFF2 via `@font-face` (weights **500** and **700**). Subset with `pyftsubset` to Basic Latin, Latin-1, general punctuation, arrows, enclosed alphanumerics (①②③), box drawing, CJK symbols, Hangul Jamo, and all Hangul syllables (U+AC00–D7A3). Fallback: `"Malgun Gothic","맑은 고딕",sans-serif`.
- The user prefers **bold**. Titles, labels, buttons, menus, table headers, and item numbers use **700**. Long reading text (article bodies, descriptions) uses **500** by default, with a header toggle ("본문 굵게") that switches body text to 700 and is remembered.
- Scale: base 15px, reading text 16px / line-height 1.9, card titles 16–17px, section titles 21px, page titles 25–28px, hero title 30px. Use `word-break: keep-all` for Korean text. Avoid text smaller than 12.5px.

## 5. Layout and screens

**App bar (64px, full width, gradient):** mascot in a white 40px circle + program name (bold 18px) + subtitle "국토안전관리원 내부 도구" · nav buttons (홈, 즐겨찾기, …, 파일 관리) with a gold count badge · right side: secondary outline buttons (e.g. 백업·공유) and one white primary button (e.g. "+ 파일 추가").

**Content:** centered, `max-width: 1120px`, padding 28px 32px. Content sits in white panels (`border-radius:12px; border:1px solid var(--line); box-shadow:var(--shadow)`).

**Standard screens:**
1. **Home.** A rounded hero (gradient, radius 18px) with a one-line question-style headline, a one-sentence explanation, the main input/search bar, quick chips (recent or example actions), and the mascot at bottom-right. Below it, a grid of **collection cards** (min 320px), each showing name, counts in gold, a short list of contents with category tags, and a footer action ("이 묶음에서 검색하기 →"). The last card is a dashed "+ add" card. Clicking a card opens that collection with the input already focused.
2. **Collection / detail pages.** Breadcrumb at top (`홈 › 묶음 › 항목`), then a header panel (title, counts, actions on the right), then content grouped by category rows (colored label on the left, tiles on the right).
3. **Results / lists.** A sticky top bar (breadcrumb + search bar). Two columns: a left **filter rail** (250px, sticky) listing categories with counts, clickable to filter, zero-count items greyed out; and the right result list of cards with bold number + title, highlighted snippet, and small status pills.
4. **Detail drawer.** Clicking an item opens a right-side drawer (560px) instead of navigating away: back/forward buttons, close (Esc), category tag + source, big title, actions (★ favorite, copy, open full view), the full text, related links as a tree, and a memo box that autosaves.
5. **Management page.** A table with checkboxes, filters (select + text + "only old" toggle), bulk actions, per-row delete, and a **trash section** below (see §7).

**Search bar component:** 56px tall, white, 2px border that turns blue on focus, magnifier icon, large input (17px), a scope chip ("철도건설법 ×" to widen to all), an option checkbox, and a navy "검색" button. Pressing `/` focuses it.

## 6. Components

- **Buttons:** primary = navy-deep fill, white bold text, hover navy. Secondary = white with `--line` border, hover blue border + blue text. Danger = secondary style that turns red on hover. Radius 9px. Small variant for tables.
- **Category tag:** solid color, white bold 12px text, radius 6px, fixed min-width, `white-space:nowrap`.
- **Pills:** soft grey (부칙/type), yellow (구버전/warning), green (최신/ok).
- **Cards:** white, radius 12px, hover blue border; selected card gets an inset navy left bar.
- **Modals:** two layers (a confirm/prompt can open above another modal), radius 14px, navy title, footer with note on the left and actions on the right. Esc closes the top layer.
- **Toast:** dark pill at bottom center, 2.2s; when it carries an action (e.g. **되돌리기**), it shows a gold button and stays 8s.
- **Busy overlay:** translucent background, mascot + progress message ("파일을 읽는 중… (2/5) 파일명").
- **Drag & drop:** full-screen navy overlay with the mascot and "여기에 놓으면 …" when files are dragged over the window. Always also offer a normal file-picker button.
- **Empty states:** mascot + what to do next + one primary button. Never a blank screen.
- **Upload confirmation:** after reading files, show a table of what was detected (name, type, date, destination) with editable fields and a status column ("새로 추가 / 새 버전 / 덮어씀 / 실패 사유") before saving.

## 7. Safety and reversibility (required)

- **Every delete is soft.** Deleted items go to a trash store (persisted), with original location, time, and reason. Overwrites also send the old item to trash.
- After any delete, show a toast "…을 삭제했습니다 [되돌리기]". Undo restores exactly that batch, including a deleted collection/group.
- Provide a **휴지통** section: restore per item, permanently delete per item (confirm), and empty trash (confirm). Only permanent deletion is irreversible, and the confirm text says so.
- Large destructive actions (deleting a whole collection) get a confirm dialog that mentions where to recover it.

## 8. Mascot rules

- Use only the official KALIS character PNG supplied by the user (`character.png`, transparent background). Never redraw, recolor, crop into a new pose, or generate a lookalike. Resizing is fine.
- Use it sparingly: app-bar avatar, home hero, empty states, busy overlay, drop overlay. Not on every card.
- If the asset is not attached in the conversation, build without it and ask the user to attach it.

## 9. Writing (UI copy)

- Korean, plain and polite (…합니다/…하세요). Name things by what the user does, not how the system works.
- Buttons state the result: "선택 삭제 (3)", "되살리기", "백업 파일 내보내기". The same action keeps the same name in button, toast, and dialog.
- Errors say what happened and how to fix it (e.g. "HWP(구형)는 읽을 수 없습니다. 한글에서 ‘다른 이름으로 저장 → HWPX’로 바꿔서 올려 주세요").
- Avoid decorative labels, ALL-CAPS, emoji clutter, and numbered markers unless the content is a real sequence.

## 10. Accessibility and quality floor

- Visible keyboard focus (`outline: 3px solid rgba(0,122,195,.45)`), Esc closes drawer/modal, Enter submits.
- Contrast: body text never lighter than `--soft` on white.
- Responsive down to ~900px (hide mascot in hero, collapse the filter rail above results). Respect `prefers-reduced-motion`.
- Motion only in response to user actions (drawer slide, highlight flash on the target item).

## 11. Verification before delivery

- Test the actual built file in real Chromium via Playwright on a `file://` URL: first load, main flow, upload with the user's real sample files, delete → undo → trash restore, reload persistence, backup export/import, and zero page errors.
- Take screenshots of each main screen and review them for readability and layout issues before delivering.
- When iterating, make targeted fixes for the reported issue rather than rewriting everything, and re-run the regression flow each time.

## 12. How to hand it over

- Present the file(s) and then give short numbered steps: where to put the file, how to open it, what the user should see if it worked, and how their existing data carries over (same browser = same IndexedDB; otherwise use backup import).
- State known limits plainly (e.g. scanned PDFs cannot be read).
