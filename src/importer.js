/* 사실관계조사 대상목록(엑셀) → 시설물(site) 변환. 화면과 무관한 순수 함수만 둔다 (Node 테스트용) */
(function (root) {
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = n => String(n).padStart(2, '0');
  // 머리글 비교: 공백·줄바꿈·괄호(와 그 안 내용) 무시
  const norm = s => String(s == null ? '' : s).replace(/[(（[][^)）\]]*[)）\]]/g, '').replace(/[\s()（）[\]]+/g, '');
  const str = v => v == null ? '' : String(v).trim();
  const HEADS = {
    no: ['연번', '번호', '순번'],
    facility: ['시설물명', '시설명'],
    owner: ['수신처', '관리주체'],
    location: ['주소', '위치', '소재지'],
    kind: ['시설물종류', '종류'],
    grade: ['종별', '구분', '종'],
    completed: ['준공일', '준공일자', '준공연도', '준공년도'],
    service: ['용역종류', '점검종류'],
    safetyGrade: ['등급', '안전등급'],
    year: ['점검연도', '점검년도', '최종점검', '최종점검연도', '최종점검일'],
    travelers: ['출장자'],
    date: ['날짜', '일자', '출장일', '점검일'],
    buildings: ['동수'],
    phone: ['연락처', '전화번호'],
    contact: ['담당자']
  };
  const LABEL = { owner: '수신처', location: '주소', kind: '시설물종류', grade: '종별', completed: '준공일', service: '용역종류', safetyGrade: '등급', travelers: '출장자', date: '날짜' };

  // 날짜: 엑셀 날짜 숫자(1900 기준) 또는 문자열(2026-11-02 (월), 2026.11.2, 26.11.2 오전 …)
  function parseDate(v) {
    let y, m, d;
    if (typeof v === 'number') {
      if (!(v > 1 && v < 2958466)) return null;
      const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
    } else {
      const s = str(v);
      const r = /(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(s);
      if (!r) return null;
      y = +r[1]; m = +r[2]; d = +r[3]; if (y < 100) y += 2000;
    }
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return { y, m, d, key: `${y}-${pad(m)}-${pad(d)}`, wd: WD[t.getUTCDay()] };
  }
  const ampmOf = v => { const r = /오전|오후|종일/.exec(str(v)); return r ? r[0] : ''; };
  function yearOf(v) {
    if (typeof v === 'number') { if (v >= 1900 && v < 2200) return v; const p = parseDate(v); return p ? p.y : null; }
    const s = str(v); let r = /(\d{4})/.exec(s); if (r) return +r[1];
    r = /[’'`]?(\d{2})\s*년/.exec(s) || /^[’'`](\d{2})/.exec(s); return r ? 2000 + +r[1] : null;
  }
  const splitNames = s => {
    let a = str(s).split(/[,，、/\n·;]+/).map(x => x.trim()).filter(Boolean);
    if (a.length === 1 && /\s/.test(a[0])) a = a[0].split(/\s+/);
    return a;
  };

  function findTable(sheets) {
    for (const sh of sheets) {
      for (let r = 0; r < Math.min(10, sh.rows.length); r++) {
        const row = sh.rows[r] || [];
        const names = [];
        for (let c = 0; c < row.length; c++) names[c] = norm(row[c]);
        if (!names.some(n => HEADS.facility.includes(n))) continue;
        const cols = {};
        for (const k in HEADS) {
          const c = names.findIndex(n => n && HEADS[k].includes(n));
          if (c >= 0) cols[k] = c;
        }
        return { sheet: sh, headRow: r, cols };
      }
    }
    return null;
  }

  // 엑셀 시트들 → { name, rows:[행 정보], warnings:[] }
  function parseWorkbook(sheets) {
    const tb = findTable(sheets || []);
    if (!tb) throw new Error('시설물명 열을 찾지 못했습니다. 머리글에 「시설물명」 칸이 있는지 확인해 주세요.');
    const { sheet, headRow, cols } = tb;
    const warnings = [];
    ['owner', 'location', 'date'].forEach(k => { if (cols[k] == null) warnings.push(`엑셀에 「${LABEL[k]}」 열이 없어 해당 칸은 비워 둡니다.`); });
    const rows = [];
    for (let r = headRow + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] || [];
      const g = k => cols[k] == null ? '' : row[cols[k]];
      const facility = str(g('facility'));
      if (!facility) break;                               // 시설물명이 빈 행에서 목록 끝
      const no = parseInt(str(g('no')), 10) || rows.length + 1;
      const who = `${no}번 ${facility}`;
      const site = {
        no, facility, owner: str(g('owner')), location: str(g('location')), kind: str(g('kind')), grade: str(g('grade')),
        completed: '', service: str(g('service')), safetyGrade: str(g('safetyGrade')), year: '',
        travelers: splitNames(g('travelers')), dateKey: '', dateLabel: '', wd: '', ampm: '',
        buildings: str(g('buildings')), phone: str(g('phone')), contact: str(g('contact'))
      };
      const cv = g('completed');
      if (str(cv)) {
        const p = parseDate(cv);
        if (p) site.completed = `${p.y}.${pad(p.m)}.${pad(p.d)}`;
        else { site.completed = str(cv); warnings.push(`${who}: 준공일 형식을 읽지 못함 (「${str(cv)}」 그대로 넣음)`); }
      }
      const dv = g('date');
      if (str(dv)) {
        const p = parseDate(dv);
        if (p) {
          site.dateKey = p.key; site.ampm = ampmOf(dv);
          const w = /\(([일월화수목금토])\)/.exec(str(dv)); site.wd = w ? w[1] : p.wd;
          site.dateLabel = typeof dv === 'number' ? `${p.key} (${site.wd})` : str(dv);
        } else { site.dateLabel = str(dv); warnings.push(`${who}: 날짜 형식을 읽지 못함 (점검기간은 비워 둠)`); }
      } else if (cols.date != null) warnings.push(`${who}: 날짜가 비어 있음`);
      const yv = g('year');
      if (str(yv)) { const y = yearOf(yv); if (y) site.year = String(y); }
      rows.push(site);
    }
    if (!rows.length) throw new Error('목록에 시설물이 없습니다. 머리글 바로 아래 줄부터 시설물명을 적어 주세요.');
    return { name: str(sheet.name), rows, warnings };
  }

  const inspectorsText = (n, mgr) => {
    n = +n || 0; mgr = +mgr || 0; if (!n && !mgr) return '';
    const p = []; if (n) p.push(`국토안전관리원 ${n}명`); if (mgr) p.push(`시설관리자 ${mgr}명`);
    return `총 ${n + mgr}명(${p.join(', ')})`;
  };
  const shortService = s => str(s).replace(/안전/g, '');
  function safetyText(r) {
    const g = str(r.safetyGrade); if (!g) return '';
    const sv = shortService(r.service), y = str(r.year) ? `’${str(r.year).slice(-2)}년` : '';
    const inner = [y, sv].filter(Boolean).join(' ');
    return inner ? `${g} (${inner})` : g;
  }
  const travelerCount = r => (r.travelers && r.travelers.length) || +r.travelerCount || 0;
  // 엑셀 행 → 보고서 기본정보(meta)에 채울 값
  function metaFromRow(r, settings, managers) {
    const out = {
      facility: r.facility, owner: r.owner, location: r.location,
      kind: settings && settings.kindMode === 'fixed' ? '건축물' : r.kind,
      grade: r.grade, completed: r.completed, safety: safetyText(r),
      inspectors: inspectorsText(travelerCount(r), managers)
    };
    const p = r.dateKey ? parseDate(r.dateKey) : null;
    if (p) { out.period = `${p.y}. ${p.m}. ${p.d}.`; out.date = `${p.y}. ${pad(p.m)}.`; }
    return out;
  }
  // 시설물에 엑셀 행 정보를 붙임 (직접 고친 항목 edited 는 덮어쓰지 않음)
  function applyRow(site, r, settings) {
    site.src = r; site.no = r.no; site.buildings = r.buildings; site.phone = r.phone; site.contact = r.contact;
    site.travelers = (r.travelers || []).slice(); site.dateLabel = r.dateLabel; site.dateKey = r.dateKey;
    const m = metaFromRow(r, settings, site.managers), ed = site.edited || [];
    for (const k in m) if (!ed.includes(k)) site.meta[k] = m[k];
    return site;
  }
  const siteKey = (facility, dateKey) => norm(facility) + '|' + (dateKey || '');
  // 다시 불러오기: 시설물명+날짜가 같은 시설물은 유지·갱신, 새 것은 추가, 빠진 것은 표시만
  function mergeSites(sites, rows, opt) {
    const used = new Set(), out = sites.slice(), res = { added: 0, updated: 0, missing: 0 };
    rows.forEach(r => {
      const s = sites.find(x => x.src && !used.has(x) && siteKey(x.src.facility, x.src.dateKey) === siteKey(r.facility, r.dateKey));
      if (s) { used.add(s); s.removed = false; applyRow(s, r, opt.settings); res.updated++; }
      else { out.push(opt.makeSite(r)); res.added++; }
    });
    sites.forEach(s => { if (s.src && !used.has(s) && opt.sameBatch) { s.removed = true; res.missing++; } });
    res.sites = out; res.matched = [...used];
    return res;
  }
  // 날짜별 묶음: 오늘 묶음 먼저, 나머지는 날짜순, 날짜 없는 것은 끝
  function groupByDate(sites, todayKey) {
    const map = new Map();
    sites.forEach(s => { const k = s.dateKey || ''; if (!map.has(k)) map.set(k, []); map.get(k).push(s); });
    const keys = [...map.keys()].sort((a, b) => (a === todayKey ? -1 : b === todayKey ? 1 : !a ? 1 : !b ? -1 : a < b ? -1 : a > b ? 1 : 0));
    return keys.map(k => ({ key: k, today: k === todayKey, label: dayLabel(k), sites: map.get(k).sort((a, b) => (a.no || 999) - (b.no || 999)) }));
  }
  function dayLabel(key) { const p = key ? parseDate(key) : null; return p ? `${p.m}.${p.d} (${p.wd})` : '날짜 없음'; }

  /* ---- 예전 목록 파일(.json, 평문) 읽기 — 새로 만드는 기능은 없앰(목록은 암호화 파일 .sajin 으로만) ---- */
  const KEYS = ['no', 'facility', 'owner', 'location', 'kind', 'grade', 'completed', 'service', 'safetyGrade', 'year',
    'travelers', 'travelerCount', 'dateKey', 'dateLabel', 'wd', 'ampm', 'buildings', 'phone', 'contact'];
  // 연락처·출장자 이름 빼기 (opt.withContact 기본 제외, opt.withTravelers === false 이면 이름 대신 인원만)
  function stripRows(rows, opt) {
    opt = opt || {};
    return rows.map(r0 => {
      const r = Object.assign({}, r0, { travelers: (r0.travelers || []).slice() });
      if (!opt.withContact) { r.phone = ''; r.contact = ''; }
      if (opt.withTravelers === false) { r.travelerCount = travelerCount(r0); r.travelers = []; }
      return r;
    });
  }
  // 밖에서 받은 행(공유 링크·목록 파일·서버 목록)을 정해진 칸·길이로 정리
  function cleanRows(list) {
    const cut = v => str(v).slice(0, 300);
    return (Array.isArray(list) ? list : []).slice(0, 500).map((r, i) => {
      const out = {}; KEYS.forEach(k => { out[k] = k === 'travelers' && Array.isArray(r && r[k]) ? r[k].join(', ') : cut(r && r[k]); });
      out.no = parseInt(out.no, 10) || i + 1;
      out.travelers = splitNames(out.travelers);
      out.travelerCount = parseInt(out.travelerCount, 10) || 0;
      if (out.dateKey && !parseDate(out.dateKey)) out.dateKey = '';
      return out;
    }).filter(r => r.facility);
  }
  function packList(name, rows, opt) {
    return { v: 1, n: str(name), k: KEYS, r: stripRows(rows, opt).map(r =>
      KEYS.map(k => k === 'travelers' ? r.travelers.join(', ') : (r[k] == null ? '' : r[k]))) };
  }
  function unpackList(o) {
    if (!o || o.v !== 1 || !Array.isArray(o.k) || !Array.isArray(o.r)) throw new Error('목록 정보 형식이 올바르지 않습니다.');
    const rows = cleanRows(o.r.map(a => { const r = {}; KEYS.forEach(k => { const j = o.k.indexOf(k); r[k] = j >= 0 && Array.isArray(a) ? a[j] : ''; }); return r; }));
    if (!rows.length) throw new Error('목록에 시설물이 없습니다.');
    return { name: str(o.n).slice(0, 300), rows };
  }
  // 이전 목록과 새 목록 비교 (관리 화면·스크립트의 「바뀐 시설물」 표시용): 시설물명+날짜 기준
  function diffRows(oldRows, newRows) {
    const key = r => siteKey(r.facility, r.dateKey), om = new Map(oldRows.map(r => [key(r), r])), nm = new Map(newRows.map(r => [key(r), r]));
    const same = (a, b) => ['owner', 'location', 'kind', 'grade', 'completed', 'service', 'safetyGrade', 'buildings', 'phone', 'contact', 'ampm']
      .every(k => String(a[k] || '') === String(b[k] || '')) && (a.travelers || []).join() === (b.travelers || []).join();
    return { added: newRows.filter(r => !om.has(key(r))).map(r => r.facility),
      removed: oldRows.filter(r => !nm.has(key(r))).map(r => r.facility),
      changed: newRows.filter(r => om.has(key(r)) && !same(om.get(key(r)), r)).map(r => r.facility) };
  }

  const api = { parseWorkbook, parseDate, metaFromRow, applyRow, mergeSites, groupByDate, dayLabel, inspectorsText, stripRows, cleanRows, packList, unpackList, diffRows };
  root.SajinImport = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
