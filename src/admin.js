/* 대상목록 파일 만들기 (관리 화면): 오프라인 admin.html 과 앱의 #admin 이 같이 쓴다.
   엑셀 → 팀 비밀번호로 암호화한 목록 파일(.sajin) 내려받기 → 기관 메일에 첨부해 팀원에게 보냄.
   또는 같은 암호화 목록을 QR 코드로 화면에 띄우거나 인쇄 → 팀원이 휴대폰 카메라로 찍음 (src/qrcodec.js).
   비밀번호·엑셀 내용은 저장하지 않고(화면을 닫으면 사라짐), 어디로도 보내지 않는다. 외부 요청 없음. */
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  function plainDownload(file) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
  }
  const appUrl = () => /^https?:$/.test(location.protocol) ? location.href.split('#')[0] : (root.SAJIN_APP_URL || '');
  function mailBody() {
    const u = appUrl();
    return ['[현장 사진대지] 대상목록 파일 안내', '',
      '첨부한 대상목록 파일을 휴대폰 앱에 불러와 주세요.',
      '1. 휴대폰 사파리로 기관 웹메일에 들어가 첨부파일 내려받기 (파일 앱 › 다운로드에 저장됨.',
      '   글자로 화면에 열리면 공유 버튼 → 「파일에 저장」)',
      `2. 앱 주소를 사파리·크롬으로 열기${u ? ': ' + u : ''}`,
      '   → 「목록 파일 불러오기」 → 저장한 파일 선택',
      '3. 처음이면 팀 비밀번호(구두로 전달받은 것)와 내 이름을 입력하면 우리 팀 목록이 보입니다.', '',
      '※ 비밀번호는 이 메일에 적지 않습니다.'].join('\n');
  }

  function start(env) {
    env = env || {};
    const LC = root.SajinListCrypto, I = root.SajinImport, CFG = env.crypto || root.SAJIN_CRYPTO;
    const v = $('#adminView'); v.innerHTML = '';
    const intro = el('section', 'block adm');
    intro.append(el('h2', null, '대상목록 파일 만들기 (팀장용)'),
      el('p', 'sub', '팀 대상목록 엑셀을 팀 비밀번호로 암호화한 목록 파일(.sajin)로 만듭니다. 만든 파일은 기관 메일에 첨부해 팀원에게 보내세요. 엑셀과 비밀번호는 이 PC 밖으로 나가지 않으며 저장되지 않습니다 (화면을 닫으면 사라짐).'));
    v.appendChild(intro);
    if (!window.isSecureContext || !root.crypto || !root.crypto.subtle || !LC || !CFG || !LC.currentSalt(CFG)) {
      intro.appendChild(el('p', 'warnbox', '이 브라우저에서는 암호화를 할 수 없습니다. 이 파일을 Chrome 또는 Edge로 열어 주세요.'));
      return;
    }
    let key = null, pass = '', parsed = null, prev = null;   // prev: {listId, team, rows, listVersion}

    // 1. 팀 비밀번호 (서버가 없어 맞는지 확인할 방법이 없으므로 두 번 입력)
    const s1 = el('section', 'block adm'); s1.appendChild(el('h3', null, '1. 팀 비밀번호'));
    s1.appendChild(el('p', 'sub', '실에서 정한 팀 비밀번호를 두 번 입력하세요. 저장되지 않습니다.'));
    const pw = el('input'); pw.type = 'password'; pw.id = 'admPass'; pw.autocomplete = 'off'; pw.setAttribute('aria-label', '팀 비밀번호');
    const pw2 = el('input'); pw2.type = 'password'; pw2.id = 'admPass2'; pw2.autocomplete = 'off'; pw2.placeholder = '한 번 더 입력'; pw2.setAttribute('aria-label', '팀 비밀번호 확인');
    const out1 = el('p', 'msg err'); out1.setAttribute('role', 'alert');
    const ok1 = button('btn primary', '확인', unlock); ok1.id = 'admPassOk';
    [pw, pw2].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); }));
    s1.append(pw, pw2, ok1, out1);

    // 2. 팀 이름 · 엑셀 · (갱신이면) 이전 목록 파일
    const s2 = el('section', 'block adm'); s2.hidden = true; s2.appendChild(el('h3', null, '2. 팀 이름 · 엑셀'));
    const tl = el('label', 'f', '팀 이름'); const tn = el('input'); tn.type = 'text'; tn.id = 'admTeam'; tn.placeholder = '예) 3팀 (부산권)'; tl.appendChild(tn);
    const xi = el('input'); xi.type = 'file'; xi.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; xi.hidden = true;
    const pi = el('input'); pi.type = 'file'; pi.hidden = true;
    const pickXls = button('btn', '엑셀 선택 (.xlsx)', () => { xi.value = ''; xi.click(); }); pickXls.id = 'admXlsBtn';
    const pickPrev = button('btn', '이전 목록 파일 불러오기 (같은 목록을 고쳐 다시 보낼 때)', () => { pi.value = ''; pi.click(); }); pickPrev.id = 'admPrevBtn';
    const prevInfo = el('div', 'admprev'), prevBox = el('div', 'admprev'), diffBox = el('div', 'admprev');
    const opt = { withTravelers: true, withContact: true, txt: store.get('sajin.listExt') === 'txt' };
    const opts = el('div');
    [['withTravelers', '출장자 이름 포함 (휴대폰에서 팀 자동 구분에 사용)'], ['withContact', '연락처·담당자 포함'],
     ['txt', '.txt 로 저장 (기관 메일이 .sajin 첨부를 막을 때)']].forEach(([k, t]) => {
      const l = el('label', 'check'); const x = el('input'); x.type = 'checkbox'; x.checked = opt[k];
      x.addEventListener('change', () => { opt[k] = x.checked; warnT.hidden = opt.withTravelers; if (k === 'txt') store.set('sajin.listExt', x.checked ? 'txt' : 'sajin'); });
      l.append(x, document.createTextNode(' ' + t)); opts.appendChild(l);
    });
    const warnT = el('p', 'warnbox', '출장자 이름을 빼면 휴대폰에서 이름으로 팀을 자동 구분할 수 없어, 실원이 팀을 직접 골라야 합니다.'); warnT.hidden = true;
    s2.append(tl, pickXls, xi, prevBox, pickPrev, pi, prevInfo, diffBox, opts, warnT);

    // 3. 파일 만들기
    const s3 = el('section', 'block adm'); s3.hidden = true; s3.appendChild(el('h3', null, '3. 목록 파일 또는 QR 만들기'));
    s3.appendChild(el('p', 'sub', '팀원이 PC 앞에 모여 있으면 「QR 만들기」(휴대폰 카메라로 찍기), 아니면 「목록 파일 만들기」(기관 메일 첨부).'));
    const out3 = el('p', 'msg'); out3.setAttribute('role', 'status');
    const mk = button('btn primary', '목록 파일 만들기', make); mk.id = 'admMake';
    const mq = button('btn primary', 'QR 만들기', makeQR); mq.id = 'admQR';
    const qopt = { noContact: false };
    const ql = el('label', 'check'); const qx = el('input'); qx.type = 'checkbox'; qx.id = 'admQrNoContact';
    qx.addEventListener('change', () => { qopt.noContact = qx.checked; });
    ql.append(qx, document.createTextNode(' QR에서 연락처·담당자 빼기 (QR 장수 줄이기)'));
    const r3 = el('div', 'row'); r3.append(mk, mq);
    s3.append(r3, ql, out3);
    const guide = el('section', 'block adm guide'); guide.hidden = true;
    const qv = el('section', 'block adm qrview'); qv.hidden = true; qv.id = 'admQrView';
    const ps = el('section', 'printsheet'); ps.hidden = true; ps.id = 'admPrint';
    v.append(s1, s2, s3, guide, qv, ps);

    async function unlock() {
      out1.className = 'msg err'; out1.textContent = '';
      try { LC.checkPass(pw.value); } catch (e) { out1.textContent = e.message; return; }
      if (pw.value !== pw2.value) { out1.textContent = '두 번 입력한 비밀번호가 다릅니다.'; return; }
      ok1.disabled = true; ok1.textContent = '확인 중…';
      try {
        pass = pw.value; key = await LC.deriveKey(pass, LC.currentSalt(CFG).salt, CFG.iter);
        pw.value = ''; pw2.value = '';
        out1.className = 'msg'; out1.textContent = '확인했습니다. 팀 이름과 엑셀을 고르세요.';
        s2.hidden = false; s3.hidden = false; tn.focus();
      } catch (e) { out1.textContent = e.message || '확인하지 못했습니다.'; }
      finally { ok1.disabled = false; ok1.textContent = '확인'; }
    }
    xi.addEventListener('change', async () => {
      const f = xi.files[0]; if (!f) return;
      prevBox.innerHTML = ''; parsed = null;
      try {
        if (!/\.xlsx$/i.test(f.name)) throw new Error('.xlsx 파일만 쓸 수 있습니다.');
        parsed = I.parseWorkbook((await root.SajinXlsx.readXlsx(await f.arrayBuffer(), root.JSZip)).sheets);
        prevBox.appendChild(el('p', 'ptitle', `${parsed.name} · ${parsed.rows.length}개 시설`));
        const ul = el('ul', 'plist');
        parsed.rows.forEach(r => { const li = el('li'); li.append(el('span', 'no', r.no), el('b', null, r.facility), el('span', 'sub', ' ' + [r.dateKey ? I.dayLabel(r.dateKey) : '', r.ampm, r.travelers.join(', ')].filter(Boolean).join(' · '))); ul.appendChild(li); });
        prevBox.appendChild(ul);
        if (parsed.warnings.length) { const w = el('div', 'warnbox'); w.appendChild(el('b', null, '확인이 필요한 칸')); parsed.warnings.forEach(t => w.appendChild(el('div', null, t))); prevBox.appendChild(w); }
        showDiff();
      } catch (e) { prevBox.appendChild(el('p', 'msg err', e.message || '엑셀을 읽지 못했습니다.')); }
    });
    // 이전 목록 파일: listId 를 이어받아 휴대폰에서 「갱신」으로 처리되게 함
    pi.addEventListener('change', async () => {
      const f = pi.files[0]; if (!f) return;
      prevInfo.innerHTML = ''; prev = null;
      try {
        let o; try { o = JSON.parse((await f.text()).replace(/^﻿/, '')); } catch (e) { o = null; }
        if (!LC.isEncFile(o)) throw new Error('대상목록 파일(.sajin)이 아닙니다.');
        const s = LC.saltById(CFG, o.kdf.saltId);
        if (!s) throw new Error('이 파일은 더 새로운 관리 파일로 만들어졌습니다. 최신 admin.html 을 받아 주세요.');
        let c;
        try { c = await LC.decryptList(await LC.deriveKey(pass, s.salt, CFG.iter), o); } catch (e) { throw new Error('이전 목록 파일이 지금 비밀번호로 열리지 않습니다.'); }
        prev = { listId: c.listId, team: c.team.name, rows: I.cleanRows(c.sites), listVersion: c.listVersion };
        if (!tn.value) tn.value = c.team.name;
        prevInfo.appendChild(el('p', 'sub', `이전 목록: ${c.team.name} · ${c.batch.name} · ${c.sites.length}곳 → 같은 목록으로 이어서 만듭니다 (휴대폰에서 「갱신」)`));
        showDiff();
      } catch (e) { prevInfo.appendChild(el('p', 'msg err', e.message)); }
    });
    function showDiff() {
      diffBox.innerHTML = '';
      if (!prev || !parsed) return;
      const d = I.diffRows(prev.rows, parsed.rows), box = el('div', 'warnbox');
      box.appendChild(el('b', null, '이전 목록과 바뀐 시설물'));
      [['추가', d.added], ['빠짐', d.removed], ['바뀜', d.changed]].forEach(([t, a]) => box.appendChild(el('div', null, `${t} ${a.length}곳${a.length ? ': ' + a.join(', ') : ''}`)));
      diffBox.appendChild(box);
    }
    async function make() {
      out3.className = 'msg err';
      if (!key) { out3.textContent = '먼저 비밀번호를 확인하세요.'; return; }
      if (!parsed) { out3.textContent = '엑셀을 선택하세요.'; return; }
      const teamName = tn.value.trim();
      if (!teamName) { out3.textContent = '팀 이름을 입력하세요.'; tn.focus(); return; }
      try {
        const content = LC.makeContent({ listId: prev && prev.listId, teamName, name: parsed.name, rows: parsed.rows,
          withContact: opt.withContact, withTravelers: opt.withTravelers ? true : false });
        const file = await LC.encryptList(key, content, { iter: CFG.iter, saltId: LC.currentSalt(CFG).id });
        // 다시 풀어서 같은지 확인한 뒤에만 내려받기
        if (JSON.stringify(await LC.decryptList(key, JSON.parse(JSON.stringify(file)))) !== JSON.stringify(content)) throw new Error('암호화 검증에 실패했습니다.');
        const text = JSON.stringify(file) + '\n', size = new Blob([text]).size;
        if (size > LC.MAX_BYTES) throw new Error(`목록 파일이 너무 큽니다 (${Math.round(size / 1024)}KB). 엑셀을 팀별로 나눠 주세요.`);
        const name = LC.fileName(content, opt.txt ? 'txt' : 'sajin');
        const blob = new File([text], name, { type: opt.txt ? 'text/plain' : 'application/octet-stream' });
        const dl = env.downloads && env.downloads();
        if (dl) await dl.save({ filename: name, data: blob }); else (env.plainDownload || plainDownload)(blob);
        out3.className = 'msg';
        out3.textContent = `${name} 파일을 내려받았습니다 (${content.team.name} · ${content.sites.length}곳 · ${(size / 1024).toFixed(1)}KB, 복호화 검증 통과).`;
        showGuide(name);
      } catch (e) { out3.textContent = e.message || '파일을 만들지 못했습니다.'; }
    }
    // QR: 목록 파일과 같은 내용·같은 키로 암호화한 주소를 QR 로 표시 (저장하지 않음, 화면을 닫으면 사라짐)
    let qr = null, qi = 0, qall = false, small = false;
    async function makeQR() {
      out3.className = 'msg err';
      if (!key) { out3.textContent = '먼저 비밀번호를 확인하세요.'; return; }
      if (!parsed) { out3.textContent = '엑셀을 선택하세요.'; return; }
      const teamName = tn.value.trim();
      if (!teamName) { out3.textContent = '팀 이름을 입력하세요.'; tn.focus(); return; }
      const Q = root.SajinQR;
      try {
        const content = LC.makeContent({ listId: prev && prev.listId, teamName, name: parsed.name, rows: parsed.rows,
          withContact: opt.withContact && !qopt.noContact, withTravelers: opt.withTravelers ? true : false });
        const e = await Q.encode(key, content, { base: appUrl(), saltId: LC.currentSalt(CFG).id });
        // 다시 모아 풀어서 같은지 확인한 뒤에만 표시
        const b = {}; e.urls.forEach(u => Q.addPart(b, Q.parsePart(u)));
        if (JSON.stringify(await Q.decrypt(key, Q.join(b))) !== JSON.stringify(Q.unpack(Q.pack(content)))) throw new Error('암호화 검증에 실패했습니다.');
        const d = new Date(), pad = n => String(n).padStart(2, '0');
        qr = { urls: e.urls, team: content.team.name, batch: content.batch.name, count: content.sites.length,
          at: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` };
        qi = 0; qall = false;
        out3.className = 'msg';
        out3.textContent = `QR ${e.urls.length}장을 만들었습니다 (${qr.team} · ${qr.count}곳, 복호화 검증 통과).`;
        ps.hidden = true; showQR(); qv.scrollIntoView({ block: 'start' });
      } catch (er) { out3.textContent = er.message || 'QR을 만들지 못했습니다.'; }
    }
    const qrInfo = () => `${qr.team} · ${qr.batch} · ${qr.count}곳 · ${qr.at} 만듦`;
    function qrFig(i, cls) {
      const n = qr.urls.length, f = el('figure', cls || 'qrfig');
      if (n > 1) f.appendChild(el('figcaption', 'qrno', `${i + 1} / ${n}`));
      const box = el('div', 'qrbox'); box.innerHTML = root.SajinQR.svg(qr.urls[i], `대상목록 QR ${i + 1} / ${n}`);
      f.appendChild(box); return f;
    }
    function showQR() {
      const n = qr.urls.length; qv.innerHTML = ''; qv.hidden = false;
      qv.appendChild(el('h3', null, '휴대폰 카메라로 찍게 하세요'));
      qv.appendChild(el('p', 'qrhead', qrInfo() + (n > 1 ? ` · QR ${n}장` : '')));
      if (n > root.SajinQR.WARN_PARTS) qv.appendChild(el('p', 'warnbox', `QR이 너무 많습니다 (${n}장). 「QR에서 연락처·담당자 빼기」에 체크하거나 메일 파일 방식(목록 파일 만들기)을 권합니다.`));
      const grid = el('div', qall ? 'qrgrid' : 'qrone');
      if (qall) qr.urls.forEach((u, i) => grid.appendChild(qrFig(i))); else grid.appendChild(qrFig(qi));
      qv.appendChild(grid);
      qv.appendChild(el('p', 'big', '휴대폰 기본 카메라(또는 앱의 「QR 찍기」)로 찍으세요.' + (n > 1 ? ` ${n}장이면 순서 상관없이 모두 찍으세요.` : '')));
      qv.appendChild(el('p', 'sub', '처음 찍는 팀원은 팀 비밀번호와 내 이름을 한 번 입력합니다. QR 안의 목록은 팀 비밀번호로 암호화되어 있습니다.'));
      const row = el('div', 'row');
      if (n > 1 && !qall) {
        const pv = button('btn', '◀ 이전 QR', () => { qi = (qi + n - 1) % n; showQR(); }); pv.id = 'admQrPrev';
        const nx = button('btn primary', '다음 QR ▶', () => { qi = (qi + 1) % n; showQR(); }); nx.id = 'admQrNext';
        row.append(pv, nx);
      }
      if (n > 1) { const al = button('btn', qall ? '한 장씩 보기' : '한 화면에 모두 보기', () => { qall = !qall; showQR(); }); al.id = 'admQrAll'; row.appendChild(al); }
      const pr = button('btn', '인쇄용 보기', showPrint); pr.id = 'admQrPrint'; row.appendChild(pr);
      row.appendChild(button('btn', 'QR 닫기', () => { qv.hidden = true; ps.hidden = true; qv.innerHTML = ''; ps.innerHTML = ''; qr = null; }));
      qv.appendChild(row);
    }
    // 인쇄용: A4 한 장에 QR(최대 4장)과 팀 이름·회차·만든 시각·사용 안내만. 시설물명·주소 등 목록 내용은 글자로 넣지 않는다
    function showPrint() {
      if (!qr) return;
      const n = qr.urls.length; ps.innerHTML = ''; ps.hidden = false;
      const tools = el('div', 'row noprint');
      const sl = el('label', 'check'); const sx = el('input'); sx.type = 'checkbox'; sx.checked = small; sx.id = 'admQrSmall';
      sx.addEventListener('change', () => { small = sx.checked; showPrint(); });
      sl.append(sx, document.createTextNode(' QR만 작게(4cm) 인쇄 — 출장계획(안)에 붙이기용'));
      const go = button('btn primary', '인쇄', () => { document.body.classList.add('printing'); window.print(); });
      go.id = 'admQrDoPrint';
      tools.append(go, button('btn', '인쇄용 보기 닫기', () => { ps.hidden = true; ps.innerHTML = ''; }), sl);
      ps.appendChild(tools);
      if (n > 4) { ps.appendChild(el('p', 'warnbox noprint', `QR이 ${n}장이라 A4 한 장에 다 넣을 수 없습니다. 「QR에서 연락처·담당자 빼기」에 체크하거나 메일 파일 방식을 쓰세요.`)); go.disabled = true; }
      const pg = el('div', 'ppage' + (small ? ' small' : '') + (n === 1 ? ' one' : ''));
      if (!small) pg.appendChild(el('h2', null, '현장 사진대지 · 대상목록 QR'));
      pg.appendChild(el('p', 'pinfo', `${qr.team} · ${qr.batch} · ${qr.at} 만듦${n > 1 ? ` · QR ${n}장` : ''}`));
      const g = el('div', 'pgrid'); qr.urls.slice(0, 4).forEach((u, i) => g.appendChild(qrFig(i, 'pfig'))); pg.appendChild(g);
      const tips = ['휴대폰으로 앱을 열고 「QR 찍기」 → 이 QR을 비추세요 (기본 카메라 앱으로 찍어도 됩니다).',
        n > 1 ? `QR ${n}장을 순서 상관없이 모두 찍으세요.` : '', '처음이면 팀 비밀번호(구두로 전달받은 것)와 내 이름을 입력합니다.',
        'QR 안의 목록은 암호화되어 있습니다. 출장이 끝나면 일반 문서처럼 파기하세요.'].filter(Boolean);
      if (small) pg.appendChild(el('p', 'pguide', tips[0]));
      else { const ol = el('ol', 'pguide'); tips.forEach(t => ol.appendChild(el('li', null, t))); pg.appendChild(ol); }
      ps.appendChild(pg);
      ps.scrollIntoView({ block: 'start' });
    }
    window.addEventListener('afterprint', () => document.body.classList.remove('printing'));
    function showGuide(name) {
      guide.innerHTML = ''; guide.hidden = false;
      guide.appendChild(el('h3', null, '4. 기관 메일로 보내기'));
      guide.appendChild(el('p', 'big', `기관 메일에 ${name} 파일을 첨부해 팀원에게 보내세요. 비밀번호는 메일에 적지 마세요.`));
      const ol = el('ol');
      ['기관 메일 새 메일 → 받는 사람: 팀원', `첨부: 방금 내려받은 ${name} (다운로드 폴더)`, '본문: 아래 「메일 본문 복사」 → 붙여 넣기', '팀 비밀번호는 구두나 내부 메신저로만 전달'].forEach(t => ol.appendChild(el('li', null, t)));
      const ta = el('textarea', 'mailbody'); ta.readOnly = true; ta.rows = 9; ta.value = mailBody(); ta.id = 'admMailBody'; ta.setAttribute('aria-label', '메일 본문');
      const info = el('p', 'sub');
      const cp = button('btn primary', '메일 본문 복사', async () => {
        try { await navigator.clipboard.writeText(ta.value); info.textContent = '복사했습니다. 메일 본문에 붙여 넣으세요.'; }
        catch (e) { ta.focus(); ta.select(); info.textContent = '본문을 선택했습니다. Ctrl+C 로 복사하세요.'; }
      });
      cp.id = 'admCopy';
      guide.append(ol, ta, cp, info);
      guide.scrollIntoView({ block: 'start' });
    }
  }
  root.SajinAdmin = { start, mailBody };
})(typeof window !== 'undefined' ? window : globalThis);
