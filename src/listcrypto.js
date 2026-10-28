/* 대상목록 파일(.sajin) 암호화 (AES-256-GCM, PBKDF2-SHA256 600,000회). 브라우저·Node 공용, Web Crypto만 사용
   목록 파일은 기관 메일 첨부로만 전달한다. 솔트는 data/crypto.json(비밀 아님)을 앱·관리 화면에 내장해 쓴다. */
(function (root) {
  const ITER = 600000, MIN_PASS = 12, CHECK = 'sajin-list-keycheck-v1';
  const te = new TextEncoder(), td = new TextDecoder();
  const subtle = () => {
    if (!root.crypto || !root.crypto.subtle) throw new Error('이 브라우저는 암호 기능을 지원하지 않습니다. https 주소(사파리·크롬)로 열어 주세요.');
    return root.crypto.subtle;
  };
  const pad = n => String(n).padStart(2, '0');
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const b = atob(String(s)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  const rand = n => root.crypto.getRandomValues(new Uint8Array(n));
  const newSalt = () => b64(rand(16));
  function checkPass(p) { if (String(p || '').length < MIN_PASS) throw new Error(`팀 비밀번호는 ${MIN_PASS}자 이상이어야 합니다. (예: 단어 3~4개를 띄어쓰기 없이 이어 붙인 문장)`); }
  // 비밀번호 → 키 (추출 불가 키: 휴대폰 저장소에 넣어도 키 값을 꺼낼 수 없음)
  async function deriveKey(pass, saltB64, iter) {
    const base = await subtle().importKey('raw', te.encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter || ITER },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, bytes) {
    const iv = rand(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes));
    return { iv, ct };
  }
  const isEncFile = f => !!(f && f.type === 'sajin-list' && f.v === 2 && f.kdf && typeof f.kdf.saltId === 'string' &&
    typeof f.ct === 'string' && typeof f.iv === 'string' && typeof f.keyCheck === 'string');
  // 평문 메타데이터는 createdAt 과 솔트 이름(saltId)뿐. 팀 이름·시설 정보는 모두 ct 안에 있다
  async function encryptList(key, content, o) {
    o = o || {};
    const kc = await seal(key, te.encode(CHECK));
    const body = await seal(key, te.encode(JSON.stringify(content)));
    const k = new Uint8Array(kc.iv.length + kc.ct.length); k.set(kc.iv); k.set(kc.ct, kc.iv.length);
    return { type: 'sajin-list', v: 2, alg: 'AES-256-GCM', kdf: { name: 'PBKDF2-SHA256', iter: o.iter || ITER, saltId: o.saltId },
      keyCheck: b64(k), iv: b64(body.iv), ct: b64(body.ct), createdAt: o.createdAt || isoLocal() };
  }
  // 솔트 목록 {iter, salts:[{id, salt}]} : 마지막이 지금 쓰는 솔트, 이전 솔트는 이전 파일을 열기 위해 남김
  const currentSalt = cfg => (cfg && cfg.salts && cfg.salts.length) ? cfg.salts[cfg.salts.length - 1] : null;
  const saltById = (cfg, id) => ((cfg && cfg.salts) || []).find(x => x.id === id) || null;
  const newSaltId = (cfg, d) => {
    const y = (d || new Date()).getFullYear(), used = new Set(((cfg && cfg.salts) || []).map(x => x.id));
    for (let i = 0; i < 26 * 26; i++) { const id = y + (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1, 65 + i % 26)); if (!used.has(id)) return id; }
    throw new Error('솔트 이름을 만들 수 없습니다.');
  };
  // 같은 목록(listId)의 판 비교: new(처음·더 새로움) | same | old
  const versionState = (prev, v) => !prev ? 'new' : String(v) > String(prev) ? 'new' : String(v) === String(prev) ? 'same' : 'old';
  const uuid = () => (root.crypto.randomUUID ? root.crypto.randomUUID() : Array.from(rand(16), b => b.toString(16).padStart(2, '0')).join(''));
  // 비밀번호(키)가 맞는지: 고정 문구를 풀어 봄
  async function checkKey(key, file) {
    try {
      const u = unb64(file.keyCheck);
      return td.decode(await subtle().decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))) === CHECK;
    } catch (e) { return false; }
  }
  async function decryptList(key, file) {
    if (!isEncFile(file)) throw new Error('암호화된 목록 파일 형식이 아닙니다.');
    if (!(await checkKey(key, file))) { const e = new Error('비밀번호가 맞지 않습니다.'); e.code = 'badkey'; throw e; }
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.ct));
    return JSON.parse(td.decode(pt));
  }
  function isoLocal(d) {
    d = d || new Date();
    const o = -d.getTimezoneOffset(), sg = o >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sg}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`;
  }
  // 올릴 때마다 바뀌는 판 번호 → 휴대폰이 갱신 여부 판단
  const listVersion = d => { d = d || new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
  const normName = s => String(s || '').replace(/\s+/g, '');
  const batchId = name => { const m = /(\d+)\s*년\s*(\d+)\s*차/.exec(name || ''); return m ? `${m[1]}-${m[2]}` : String(name || '').slice(0, 40); };
  // 목록 파일 내용 (엑셀 importer 결과 + 팀 정보). 같은 팀·같은 회차를 다시 보낼 때는 listId 를 그대로 넘겨 갱신으로 처리
  function makeContent(o) {
    const I = root.SajinImport;
    const rows = I.stripRows(o.rows, { withContact: o.withContact !== false, withTravelers: o.withTravelers });
    const members = [...new Set(rows.flatMap(r => r.travelers || []).map(normName).filter(Boolean))];
    const dates = [...new Set(rows.map(r => r.dateKey).filter(Boolean))].sort();
    return { listId: o.listId || uuid(), listVersion: listVersion(o.now), team: { name: o.teamName || '팀', members },
      batch: { id: batchId(o.name), name: o.name || '', dates }, sites: rows };
  }
  // 파일 이름: 대상목록_{팀이름}_{회차id}.sajin (특수문자 제거). 기관 메일이 낯선 확장자를 막으면 .txt
  const fileName = (c, ext) => `대상목록_${String(c.team.name).replace(/[\\/:*?"<>|()\s]+/g, '') || '팀'}_${String(c.batch.id).replace(/[^0-9A-Za-z가-힣-]+/g, '') || '목록'}.${ext === 'txt' ? 'txt' : 'sajin'}`;
  const MAX_BYTES = 100 * 1024;

  const api = { ITER, MIN_PASS, MAX_BYTES, newSalt, newSaltId, currentSalt, saltById, checkPass, deriveKey, encryptList, decryptList, checkKey, isEncFile, isoLocal, listVersion, versionState, normName, batchId, makeContent, fileName };
  root.SajinListCrypto = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
