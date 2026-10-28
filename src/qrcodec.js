/* QR 코드로 대상목록 보내기: 목록 → 짧은 키 → 압축(fflate) → 암호화(AES-256-GCM, 목록 파일과 같은 키·솔트) → base64url → 조각 주소
   주소 형식: <앱 주소>#q=<조각 번호>.<전체 조각 수>.<묶음 식별값>.<데이터>   (목록은 # 뒤에만: 서버로 전송되지 않음)
   QR 데이터에는 keyCheck 가 없다. 복호화 실패(GCM 인증 실패) = 비밀번호가 틀렸거나 QR 손상. 브라우저·Node 공용 */
(function (root) {
  const te = new TextEncoder(), td = new TextDecoder();
  const MAX_URL = 1100, VER = 1, WARN_PARTS = 4;
  const subtle = () => {
    if (!root.crypto || !root.crypto.subtle) throw new Error('이 브라우저는 암호 기능을 지원하지 않습니다. https 주소(사파리·크롬)로 열어 주세요.');
    return root.crypto.subtle;
  };
  const Z = () => { if (!root.fflate) throw new Error('압축 도구(fflate)를 불러오지 못했습니다.'); return root.fflate; };
  function b64u(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  // 짧은 키 변환표 (앱·관리 화면 공용). 시설물은 열 단위로 묶고, 모두 빈 열은 넣지 않는다
  const ROW = { no: 'o', facility: 'f', owner: 'w', location: 'l', kind: 'k', grade: 'g', completed: 'c', service: 'sv',
    safetyGrade: 'sg', year: 'y', travelers: 'tr', travelerCount: 'tc', dateKey: 'd', dateLabel: 'dl', wd: 'wd', ampm: 'a',
    buildings: 'bd', phone: 'p', contact: 'ct' };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wdOf = k => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ''); return m ? WD[new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).getUTCDay()] : ''; };
  const normName = s => String(s || '').replace(/\s+/g, '');
  const sv = v => v == null ? '' : String(v);
  // 목록 내용 → 짧은 형태. members·dates 는 시설물에서 다시 계산, 요일·날짜 표시는 날짜에서 나오면 생략
  function pack(c) {
    const rows = c.sites || [], cols = {};
    for (const k in ROW) {
      const a = rows.map((r, i) => {
        if (k === 'travelers') return (r.travelers || []).join(',');
        if (k === 'no') return +r.no === i + 1 ? '' : sv(r.no);
        if (k === 'travelerCount') return +r.travelerCount ? sv(r.travelerCount) : '';
        if (k === 'wd') return r.wd === wdOf(r.dateKey) ? '' : (r.wd ? r.wd : '-');
        if (k === 'owner') return r.owner && r.facility && r.owner.startsWith(r.facility) ? '~' + r.owner.slice(r.facility.length) : sv(r.owner);
        if (k === 'dateLabel') return r.dateLabel === (r.dateKey ? `${r.dateKey} (${r.wd})` : '') ? '' : (r.dateLabel ? r.dateLabel : '-');
        return sv(r[k]);
      });
      if (a.some(Boolean)) cols[ROW[k]] = a;
    }
    const out = { i: c.listId, v: c.listVersion, t: c.team && c.team.name, b: c.batch && c.batch.id, n: c.batch && c.batch.name, m: rows.length, s: cols };
    if (c.batch && c.batch.name && c.batch.id === batchIdOf(c.batch.name)) delete out.b;
    return out;
  }
  const batchIdOf = name => { const m = /(\d+)\s*년\s*(\d+)\s*차/.exec(name || ''); return m ? `${m[1]}-${m[2]}` : String(name || '').slice(0, 40); };
  function unpack(o) {
    if (!o || typeof o !== 'object' || !o.i || !o.s) throw new Error('QR 목록 형식이 올바르지 않습니다.');
    const n = Math.min(+o.m || 0, 500), sites = [];
    for (let i = 0; i < n; i++) {
      const r = {};
      for (const k in ROW) {
        const col = o.s[ROW[k]], v = col ? sv(col[i]) : '';
        if (k === 'travelers') r[k] = v ? v.split(',') : [];
        else if (k === 'no') r[k] = v ? (parseInt(v, 10) || v) : i + 1;
        else if (k === 'travelerCount') r[k] = parseInt(v, 10) || 0;
        else r[k] = v;
      }
      if (r.owner[0] === '~') r.owner = r.facility + r.owner.slice(1);
      r.wd = r.wd === '-' ? '' : (r.wd || wdOf(r.dateKey));
      r.dateLabel = r.dateLabel === '-' ? '' : (r.dateLabel || (r.dateKey ? `${r.dateKey} (${r.wd})` : ''));
      sites.push(r);
    }
    const name = sv(o.n);
    return { listId: sv(o.i), listVersion: sv(o.v), team: { name: sv(o.t) || '팀', members: [...new Set(sites.flatMap(r => r.travelers).map(normName).filter(Boolean))] },
      batch: { id: o.b != null ? sv(o.b) : batchIdOf(name), name, dates: [...new Set(sites.map(r => r.dateKey).filter(Boolean))].sort() }, sites };
  }

  // 압축 사전: 대상목록에 자주 나오는 낱말을 미리 알려 주어 QR 장수를 줄임. ★ 바꾸면 예전 QR을 못 읽으므로 VER 를 올릴 것
  const DICT = te.encode([
    '서울특별시 부산광역시 대구광역시 인천광역시 광주광역시 대전광역시 울산광역시 세종특별자치시 경기도 강원특별자치도 충청북도 충청남도 전북특별자치도 전라남도 경상북도 경상남도 제주특별자치도',
    '판매시설 업무시설 교육연구시설 문화및집회시설 의료시설 숙박시설 운동시설 근린생활시설 노유자시설 복합건축물 공동주택 건축물',
    '정밀안전진단 정밀안전점검 정기안전점검 긴급안전점검 1종 2종 3종 오전 오후 종일 빌딩 타워 센터 오피스텔 주상복합 상가 백화점 병원 학교',
    'A B C D E 가나다 번길 대로 로 길 동 리 읍 면 구 군 시 아파트 관리사무소',
    '"d":["2026-', '"tr":["', '"dl":["', '"sv":["', '"sg":["', '"bd":["', '"ct":["', '"p":["000-', '"a":["', '"y":["', '"c":["', '"g":["', '"k":["', '"l":["', '"w":["~ 관리사무소', '"f":["',
    '{"i":"', '","v":"2026', '","t":"', '","n":"', '년 차 관리주체 합동점검 대상', '","m":', ',"s":{'].join(' '));
  // 묶음 식별값: listId 앞 4자 + (판 번호·IV) 해시 2자 → 다른 판·다시 만든 QR 조각이 섞이지 않게
  async function bundleId(c, iv) {
    const h = new Uint8Array(await subtle().digest('SHA-256', te.encode(String(c.listVersion) + '|' + b64u(iv))));
    return String(c.listId).replace(/[^0-9A-Za-z]/g, '').slice(0, 4) + b64u(h.subarray(0, 3)).slice(0, 3);
  }
  // 묶음 바이트: [형식 1][솔트 이름 길이][솔트 이름][IV 12][암호문]
  async function encode(key, content, o) {
    o = o || {};
    const base = String(o.base || '').split('#')[0];
    if (!/^https?:\/\//.test(base)) throw new Error('앱 주소를 알 수 없어 QR을 만들 수 없습니다. 최신 관리 파일(admin.html)을 받아 주세요.');
    const sid = te.encode(String(o.saltId || ''));
    if (!sid.length || sid.length > 40) throw new Error('솔트 이름이 올바르지 않습니다.');
    const z = Z().deflateSync(te.encode(JSON.stringify(pack(content))), { level: 9, mem: 12, dictionary: DICT });
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, z));
    const bin = new Uint8Array(2 + sid.length + 12 + ct.length);
    bin[0] = VER; bin[1] = sid.length; bin.set(sid, 2); bin.set(iv, 2 + sid.length); bin.set(ct, 14 + sid.length);
    const data = b64u(bin), bid = await bundleId(content, iv);
    const head = n => `${base}#q=${n}.${n}.${bid}.`.length;
    let n = 1;
    while (head(n) + Math.ceil(data.length / n) > (o.maxLen || api.MAX_URL)) n++;
    const per = Math.ceil(data.length / n), urls = [];
    for (let i = 0; i < n; i++) urls.push(`${base}#q=${i + 1}.${n}.${bid}.${data.slice(i * per, (i + 1) * per)}`);
    return { urls, bid, parts: n, bytes: bin.length, zipped: z.length, longest: Math.max(...urls.map(u => u.length)) };
  }
  // 주소(또는 # 뒤) → 조각. 이 앱 형식이 아니면 null
  function parsePart(s) {
    const m = /#q=(\d{1,2})\.(\d{1,2})\.([0-9A-Za-z_-]{3,12})\.([0-9A-Za-z_-]+)$/.exec(String(s || '').trim());
    if (!m) return null;
    const i = +m[1], n = +m[2];
    if (!(n >= 1 && n <= 20 && i >= 1 && i <= n)) return null;
    return { i, n, bid: m[3], data: m[4] };
  }
  // 받은 조각 모음 {n, parts:{번호:데이터}} 에 더하기 (중복은 덮어씀). 다 모였으면 true
  function addPart(bundle, p) {
    bundle.n = p.n; bundle.parts = bundle.parts || {}; bundle.parts[p.i] = p.data;
    return isComplete(bundle);
  }
  const isComplete = b => !!b && b.n >= 1 && Array.from({ length: b.n }, (_, k) => b.parts && b.parts[k + 1]).every(Boolean);
  const received = b => Object.keys((b && b.parts) || {}).map(Number).filter(i => i >= 1 && i <= b.n).sort((a, c) => a - c);
  // 다 모인 조각 → {saltId, iv, ct}
  function join(bundle) {
    if (!isComplete(bundle)) throw new Error('QR 조각이 아직 다 모이지 않았습니다.');
    const bin = unb64u(Array.from({ length: bundle.n }, (_, k) => bundle.parts[k + 1]).join(''));
    if (bin[0] !== VER) throw new Error('이 QR은 더 새로운 앱에서 만들어졌습니다. 앱을 새로고침한 뒤 다시 찍어 주세요.');
    const l = bin[1];
    if (bin.length < 2 + l + 12 + 17) throw new Error('QR 데이터가 손상되었습니다. 다시 찍어 주세요.');
    return { saltId: td.decode(bin.subarray(2, 2 + l)), iv: bin.slice(2 + l, 14 + l), ct: bin.slice(14 + l) };
  }
  // 풀기: 틀린 비밀번호·손상은 code 'badkey' (평문 일부도 내보내지 않음)
  async function decrypt(key, payload) {
    let z;
    try { z = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: payload.iv }, key, payload.ct)); }
    catch (e) { const er = new Error('팀 비밀번호가 맞지 않거나 QR이 손상되었습니다. 비밀번호를 다시 입력하거나 QR을 다시 찍어 주세요.'); er.code = 'badkey'; throw er; }
    return unpack(JSON.parse(td.decode(Z().inflateSync(z, { dictionary: DICT }))));
  }
  async function check(key, payload) { try { await decrypt(key, payload); return true; } catch (e) { return false; } }

  // QR 그림 (qrcode-generator, 오류정정 M, 바깥 여백 4칸). SVG 라서 화면·인쇄 모두 선명
  function matrix(text) {
    if (!root.qrcode) throw new Error('QR 도구(qrcode-generator)를 불러오지 못했습니다.');
    const q = root.qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
    const n = q.getModuleCount();
    return { size: n, dark: (r, c) => q.isDark(r, c) };
  }
  function svg(text, label) {
    const m = matrix(text), Q = 4, w = m.size + Q * 2;
    let d = '';
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c + Q} ${r + Q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges" role="img" aria-label="${String(label || 'QR 코드').replace(/[<>&"]/g, '')}"><rect width="${w}" height="${w}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const api = { MAX_URL, WARN_PARTS, ROW, pack, unpack, encode, parsePart, addPart, isComplete, received, join, decrypt, check, matrix, svg };
  root.SajinQR = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
