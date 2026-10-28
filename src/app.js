(() => {
'use strict';
// QR 로 열린 주소(#q=…)는 가장 먼저 꺼내고 주소에서 지운다 (방문 기록에 남지 않게). 처리는 load() 끝에서
const bootQr = /^#q=/.test(location.hash) ? location.hash : '';
if (bootQr) history.replaceState(null, '', location.pathname + location.search);
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const today = new Date();
const PARTS = ['슬래브','보','기둥','벽체','담장','관람석','계단','지붕(막구조)','옹벽','난간','부착물','바닥'];
const DAMAGE = ['균열','철근노출','박리·박락','누수·백태','기울음','파손','부식','체결불량','처짐'];
const LABELS = ['정밀안전점검 보고서 발췌','정밀안전점검 시의 외관조사 사진'];

const IMP = window.SajinImport;
const defaultMeta = () => ({
  date:`${today.getFullYear()}. ${String(today.getMonth()+1).padStart(2,'0')}.`,
  purpose:'정밀안전점검·진단의 사실관계확인 및 시설물 유지관리요령 전파',
  period:`${today.getFullYear()}. ${today.getMonth()+1}. ${today.getDate()}.`,
  inspectors:'', facility:'', owner:'', location:'',
  kind:'', grade:'', completed:'', floors:'', area:'', height:'', safety:'',
  resultHeading:'합동점검 결과', defaultLabel:'합동점검 사진'
});
const defaultSections = () => [
  {id:uid(), title:'외관조사의 적정성', item:'외관조사 적정성 확인', opinion:'', photos:[]},
  {id:uid(), title:'비파괴조사 적정성', item:'비파괴조사 적정성 확인', opinion:'', photos:[]},
  {id:uid(), title:'유지관리 방안의 적정성', item:'유지관리 방안의 적정성 확인', opinion:'', photos:[]},
  {id:uid(), title:'시설물 안전 및 유지관리에 관한 특이사항', item:'기타 시설물 안전 및 유지관리에 관한 특이사항 확인', opinion:'', photos:[]},
  {id:uid(), type:'proposal', title:'보수・보강 및 유지관리 제안', opinion:'외관조사망도에 제시된 손상을 참고하여 지속적인 관리가 필요함', photos:[]}
];
const defaultApp = () => ({v:3, batch:null, activeId:null, settings:{kindMode:'excel', crop:true, withPhotos:true, attach1:true}, sites:[]});
// 시설물 1건 = 보고서 1건. row: 엑셀 대상목록의 행 (직접 입력이면 없음)
function newSite(row){
  const s = {id:'site_' + uid(), no:0, buildings:'', phone:'', contact:'', travelers:[], dateLabel:'', dateKey:'',
    savedAt:null, edited:[], managers:0, src:null, meta:defaultMeta(), sections:defaultSections()};
  if (row) IMP.applyRow(s, row, app.settings);
  return s;
}

let app = defaultApp();    // 저장되는 전체 자료 (v3)
let state = null;          // 지금 열려 있는 시설물 (meta·sections)
const blobs = new Map();   // photoId -> Blob (열린 시설물의 사진만)
const urls = new Map();    // photoId -> objectURL

/* ---------- IndexedDB ---------- */
let dbp = null;
function idb(){
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try{
      const r = indexedDB.open('sajindaeji', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('photos'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }catch(e){ rej(e); }
  });
  return dbp;
}
async function tx(store, mode, fn){
  try{
    const db = await idb();
    return await new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store);
      const out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error);
    });
  }catch(e){ return undefined; }
}
let saveTimer = null;
function persist(){ clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 400); }
function persistNow(){ clearTimeout(saveTimer); saveTimer = null; return tx('kv','readwrite', s => s.put(JSON.stringify(app),'appState')); }
window.addEventListener('pagehide', () => { if (saveTimer) persistNow(); });
// iOS(사파리·인앱브라우저)에서 저장된 Blob이 깨지는 문제 방지: 사진을 바이트(ArrayBuffer)로 저장
const putPhoto = async (id, blob) => { let buf; try{ buf = await blob.arrayBuffer(); }catch(e){ return; } return tx('photos','readwrite', s => s.put({buf, type:'image/jpeg'}, id)); };
async function toFreshBlob(v){
  try{
    if (!v) return null;
    const buf = v.buf ? v.buf : await v.arrayBuffer();
    if (!buf || !buf.byteLength) return null;
    return new Blob([buf], {type:'image/jpeg'});
  }catch(e){ return null; }
}
const delPhoto = id => tx('photos','readwrite', s => s.delete(id));
const getKV = (db, key) => new Promise(res => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });

async function load(){
  if (adminMode){ startAdmin(); return; }
  try{
    const db = await idb();
    const raw = await getKV(db, 'appState');
    if (raw){
      const st = JSON.parse(raw);
      if (st && Array.isArray(st.sites)) app = Object.assign(defaultApp(), st, {settings:Object.assign(defaultApp().settings, st.settings)});
      if (app.remote){
        // 지시서 2(서버 팀 칸) 방식으로 받은 목록: 시설물·사진은 그대로 두고 「이전 방식으로 받은 목록」으로 표시
        const sl = app.remote.slots || {}; app.legacySlots = {};
        Object.keys(sl).forEach(n => { if (sl[n].teamName) app.legacySlots[n] = sl[n].teamName; });
        T().myName = app.remote.myName || ''; T().nameAsked = !!app.remote.nameAsked;
        delete app.remote; persist();
      }
      tx('kv','readwrite', x => x.delete('listKey'));
    } else {
      // 예전 버전(보고서 1건, 'draft') 자료를 시설물 1건으로 옮김. 옮긴 결과가 저장된 뒤에만 예전 자료를 지움
      const old = await getKV(db, 'draft');
      const st = old && JSON.parse(old);
      if (st && st.sections){
        const s = newSite(null);
        s.no = 1; s.meta = Object.assign(defaultMeta(), st.meta); s.sections = st.sections;
        app.settings.crop = st.crop !== false; app.settings.attach1 = st.attach1 !== false; app.settings.withPhotos = st.withPhotos !== false;
        app.sites = [s]; app.activeId = s.id;
        if (await persistNow() === 'appState') await tx('kv','readwrite', x => x.delete('draft'));
      }
    }
  }catch(e){}
  await loadQrParts();
  const open = app.sites.find(s => s.id === app.activeId);
  if (open && !bootQr) await openSite(open.id); else showList();
  checkHash();
  if (bootQr) receiveQr(bootQr, false);
}
// 시설물 사진 불러오기 (열 때만 읽어 메모리를 아낌)
async function loadPhotos(site){
  let lost = 0, db;
  try{ db = await idb(); }catch(e){ return 0; }
  const ids = site.sections.flatMap(s => s.photos.map(p => p.id));
  const found = new Set();
  await Promise.all(ids.map(id => new Promise(res => {
    try{
      const r = db.transaction('photos').objectStore('photos').get(id);
      r.onsuccess = async () => { const b = await toFreshBlob(r.result); if (b){ found.add(id); blobs.set(id, b); urls.set(id, URL.createObjectURL(b)); if (!r.result.buf) putPhoto(id, b); } else { lost++; delPhoto(id); } res(); };
      r.onerror = () => { found.add(id); res(); };   // 읽기 오류는 사진을 빼지 않음
    }catch(e){ found.add(id); res(); }
  })));
  if (lost){ site.sections.forEach(s => s.photos = s.photos.filter(p => found.has(p.id))); persist(); }
  return lost;
}
function freePhotos(){ urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); blobs.clear(); }
const photoCount = site => site.sections.reduce((a, s) => a + s.photos.length, 0);

/* ---------- 화면 전환: 대상 목록 ↔ 작성 화면 ---------- */
let listShown = false;
function showView(list){
  listShown = list;
  $('#listView').hidden = !list; $('#editView').hidden = list; $('#bar').hidden = list;
  $('#backBtn').hidden = list; $('#resetBtn').hidden = list; $('#setBtn').hidden = !list;
  window.scrollTo(0, 0);
}
async function openSite(id){
  const site = app.sites.find(s => s.id === id); if (!site) return;
  freePhotos();
  state = site; app.activeId = id; editVer++; prepared = null;
  const lost = await loadPhotos(site);
  persist(); showView(false); render();
  $('#metaBox').open = !site.src && !site.meta.facility;
  setMsg(lost ? `이전에 넣은 사진 ${lost}장을 불러오지 못해 목록에서 뺐습니다. 해당 사진만 다시 추가해 주세요.` : '', !!lost);
}
function showList(){
  if (dlg.open) dlg.close();
  freePhotos(); state = null; app.activeId = null; persist();
  showView(true); renderList();
}
$('#backBtn').addEventListener('click', showList);

/* ---------- 이미지 처리 ---------- */
async function processImage(file){
  let src, w, h;
  try{ src = await createImageBitmap(file, {imageOrientation:'from-image'}); w = src.width; h = src.height; }
  catch(e){
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  let sx = 0, sy = 0, sw = w, sh = h;
  if (app.settings.crop){
    const landscape = w >= h;
    const target = landscape ? 4/3 : 3/4;
    if (w / h > target){ sw = Math.round(h * target); sx = Math.round((w - sw)/2); }
    else { sh = Math.round(w / target); sy = Math.round((h - sh)/2); }
  }
  const MAX = 1600, k = Math.min(1, MAX / Math.max(sw, sh));
  const cw = Math.round(sw * k), ch = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,cw,ch);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
  return {blob, w:cw, h:ch};
}

/* ---------- 렌더 ---------- */
const META_FIELDS = [
  ['date','표지 연월 (예: 2026. 10.)'],['period','점검기간'],
  ['purpose','목적',1],['inspectors','점검자 (괄호 안은 작은 글씨로 들어감)',1],
  ['facility','시설물명'],['owner','관리주체'],['location','위치',1],
  ['kind','종류'],['grade','구분 (1종/2종/3종)'],['completed','준공일'],['floors','층수 (지상/지하)'],
  ['area','연면적'],['height','최고높이'],['safety','안전등급 (예: B (’25년 정밀점검))',1],
  ['resultHeading','결과 장 제목'],['defaultLabel','사진 기본 제목']
];
function renderMeta(){
  const f = $('#metaForm'); f.innerHTML = '';
  const inputs = {};
  if (state.src){
    const p = document.createElement('p'); p.className = 'sub full';
    p.textContent = '엑셀 대상목록에서 채운 값입니다. 직접 고친 칸은 엑셀을 다시 불러와도 바뀌지 않습니다. 층수·연면적·최고높이는 현장에서 입력하세요.';
    f.appendChild(p);
  }
  META_FIELDS.forEach(([k, label, full]) => {
    const l = document.createElement('label'); l.className = 'f' + (full ? ' full' : '');
    l.textContent = label;
    const i = document.createElement('input'); i.type = 'text'; i.value = state.meta[k] || ''; inputs[k] = i;
    i.addEventListener('input', () => {
      state.meta[k] = i.value; if (!state.edited.includes(k)) state.edited.push(k);
      if (k === 'facility' || k === 'defaultLabel') { updateHeader(); if (k==='defaultLabel') renderSections(); } persist();
    });
    l.appendChild(i); f.appendChild(l);
    if (k === 'inspectors' && state.src){
      // 현장에서 시설관리자 인원만 넣으면 점검자 문구를 자동으로 완성
      const ml = document.createElement('label'); ml.className = 'f full'; ml.textContent = '시설관리자 인원 (넣으면 점검자 문구 자동 완성)';
      const mi = document.createElement('input'); mi.type = 'number'; mi.inputMode = 'numeric'; mi.min = '0'; mi.max = '99'; mi.value = state.managers || '';
      mi.addEventListener('input', () => {
        state.managers = Math.max(0, parseInt(mi.value, 10) || 0);
        const n = state.travelers.length || +state.src.travelerCount || 0;
        state.meta.inspectors = IMP.inspectorsText(n, state.managers); inputs.inspectors.value = state.meta.inspectors;
        state.edited = state.edited.filter(x => x !== 'inspectors'); persist();
      });
      ml.appendChild(mi); f.appendChild(ml);
    }
  });
  const c = document.createElement('label'); c.className = 'check full';
  c.innerHTML = '<input type="checkbox"> 사진을 4:3 비율로 맞춰 자르기 (보고서 칸 크기 통일)';
  const cb = c.querySelector('input'); cb.checked = !!app.settings.crop;
  cb.addEventListener('change', () => { app.settings.crop = cb.checked; persist(); });
  f.appendChild(c);
  [['attach1','제안에 「시설물안전법 실시시기(붙임1)」 문구 넣기'],['withPhotos','보고서와 함께 사진 원본 파일도 보내기']].forEach(([k,t]) => {
    const l = document.createElement('label'); l.className = 'check full';
    l.innerHTML = '<input type="checkbox"> '; l.appendChild(document.createTextNode(t));
    const x = l.querySelector('input'); x.checked = app.settings[k] !== false;
    x.addEventListener('change', () => { app.settings[k] = x.checked; persist(); });
    f.appendChild(l);
  });
  if (state.src){
    // 종류 칸: 엑셀의 시설물종류(기본) 또는 원본 양식처럼 「건축물」 고정 — 모든 시설물에 적용
    const l = document.createElement('label'); l.className = 'check full';
    l.innerHTML = '<input type="checkbox"> '; l.appendChild(document.createTextNode('종류 칸을 원본 양식처럼 「건축물」로 고정 (끄면 엑셀의 시설물종류)'));
    const x = l.querySelector('input'); x.checked = app.settings.kindMode === 'fixed';
    x.addEventListener('change', () => {
      app.settings.kindMode = x.checked ? 'fixed' : 'excel';
      app.sites.forEach(s => { if (s.src && !s.edited.includes('kind')) s.meta.kind = IMP.metaFromRow(s.src, app.settings).kind; });
      inputs.kind.value = state.meta.kind || ''; persist();
    });
    f.appendChild(l);
  }
}
function updateHeader(){
  $('#hdrSub').textContent = state.meta.facility ? (state.no ? state.no + '. ' : '') + state.meta.facility : '새 보고서';
  const n = state.sections.reduce((a, s) => a + s.photos.length, 0);
  $('#cnt').textContent = n + '장';
}

function captionHTML(p){
  const t = document.createElement('div'); t.className = 'cap';
  t.textContent = p.label || state.meta.defaultLabel || '합동점검 사진';
  if (p.desc){ const e = document.createElement('em'); e.textContent = '(' + p.desc + ')'; t.appendChild(e); }
  return t;
}

function renderSections(){
  const box = $('#sections'); box.innerHTML = '';
  const results = state.sections.filter(s => s.type !== 'proposal');
  state.sections.forEach((s, idx) => {
    const isProp = s.type === 'proposal';
    const el = document.createElement('section'); el.className = 'block sec';
    const head = document.createElement('div'); head.className = 'sec-head';
    const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = isProp ? '□' : 'ㅇ';
    const ti = document.createElement('textarea'); ti.className = 'tin'; ti.rows = 1; ti.value = s.title; ti.setAttribute('aria-label','항목 제목');
    const fit = () => { ti.style.height = 'auto'; ti.style.height = ti.scrollHeight + 'px'; };
    ti.addEventListener('input', () => { ti.value = ti.value.replace(/\n/g,''); s.title = ti.value; fit(); persist(); });
    requestAnimationFrame(fit);
    head.append(mark, ti);
    if (!isProp){
      const ri = results.indexOf(s);
      const up = btn('icon','↑', () => moveSec(s, -1), '위로'); up.disabled = ri === 0;
      const dn = btn('icon','↓', () => moveSec(s, 1), '아래로'); dn.disabled = ri === results.length - 1;
      const del = btn('icon','✕', () => removeSec(s), '항목 삭제');
      head.append(up, dn, del);
    }
    el.appendChild(head);
    if (isProp) { const k = document.createElement('p'); k.className = 'kind'; k.textContent = '보고서에서 별도 장(□)으로 들어갑니다. 한 줄에 한 항목씩 적으면 ㅇ 항목으로 정리됩니다.'; el.appendChild(k); }
    if (!s.isOverview){
      const ta = document.createElement('textarea');
      ta.placeholder = isProp ? '예) 외관조사망도에 제시된 손상을 참고하여 지속적으로 관리 필요' : '현장 확인 의견 (줄을 바꾸면 - 항목이 나뉩니다)';
      ta.value = s.opinion || '';
      ta.addEventListener('input', () => { s.opinion = ta.value; persist(); });
      el.appendChild(ta);
    }
    if (s.photos.length){
      const g = document.createElement('div'); g.className = 'grid';
      s.photos.forEach(p => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ph';
        b.setAttribute('aria-label', '사진 편집: ' + (p.desc || '설명 없음'));
        const im = document.createElement('div'); im.className = 'img';
        const img = document.createElement('img'); img.src = urls.get(p.id) || ''; img.alt = ''; im.appendChild(img);
        b.append(im, captionHTML(p));
        b.addEventListener('click', () => openSheet(s.id, p.id));
        g.appendChild(b);
      });
      el.appendChild(g);
    }
    const add = btn('add','＋ 사진 촬영·추가', () => pickPhotos(s.id));
    add.dataset.sec = s.id;
    el.appendChild(add);
    box.appendChild(el);
  });
  updateHeader();
}
function btn(cls, text, fn, aria){
  const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text;
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', fn); return b;
}
function render(){ renderMeta(); renderSections(); }

function moveSec(s, d){
  const arr = state.sections; const i = arr.indexOf(s); let j = i + d;
  if (j < 0 || j >= arr.length || arr[j].type === 'proposal') return;
  [arr[i], arr[j]] = [arr[j], arr[i]]; persist(); renderSections();
}
function removeSec(s){
  const msg = s.photos.length ? `"${s.title}" 항목과 사진 ${s.photos.length}장을 삭제할까요?` : `"${s.title}" 항목을 삭제할까요?`;
  if (!confirm(msg)) return;
  s.photos.forEach(p => dropPhoto(p.id));
  state.sections = state.sections.filter(x => x !== s); persist(); renderSections();
}
function dropPhoto(id){ delPhoto(id); blobs.delete(id); if (urls.has(id)) URL.revokeObjectURL(urls.get(id)); urls.delete(id); }

$('#addSecBtn').addEventListener('click', () => {
  const t = prompt('점검 항목 제목', '기타 확인사항'); if (!t) return;
  const pi = state.sections.findIndex(s => s.type === 'proposal');
  state.sections.splice(pi < 0 ? state.sections.length : pi, 0, {id:uid(), title:t, opinion:'', photos:[]});
  persist(); renderSections();
});

/* ---------- 사진 추가 ---------- */
let targetSec = null;
function pickPhotos(secId){ targetSec = secId; const fi = $('#fileIn'); fi.value = ''; fi.click(); }
$('#fileIn').addEventListener('change', async e => {
  const files = [...e.target.files]; if (!files.length) return;
  const s = state.sections.find(x => x.id === targetSec); if (!s) return;
  const addBtn = document.querySelector(`.add[data-sec="${s.id}"]`);
  let done = 0, failed = 0;
  for (const f of files){
    if (addBtn){ addBtn.classList.add('busy'); addBtn.textContent = `사진 정리 중… ${done + 1}/${files.length}`; }
    try{
      const r = await processImage(f);
      const id = uid();
      blobs.set(id, r.blob); urls.set(id, URL.createObjectURL(r.blob));
      await putPhoto(id, r.blob);
      s.photos.push({id, w:r.w, h:r.h, label:'', desc:''});
      done++;
    }catch(err){ failed++; }
  }
  persist(); renderSections();
  setMsg(failed ? `${failed}장은 열 수 없는 형식이라 제외했습니다. JPG·PNG 사진을 선택하세요.` : `사진 ${done}장을 추가했습니다. 사진을 눌러 설명을 입력하세요.`, !!failed);
});

/* ---------- 사진 편집 시트 ---------- */
const dlg = $('#dlg');
function openSheet(secId, pid){
  const s = state.sections.find(x => x.id === secId); if (!s) return;
  const i = s.photos.findIndex(p => p.id === pid); const p = s.photos[i]; if (!p) return;
  const sh = $('#sheet'); sh.innerHTML = '';
  const prev = document.createElement('div'); prev.className = 'prev';
  const img = document.createElement('img'); img.src = urls.get(p.id); img.alt = '선택한 사진'; prev.appendChild(img);

  const lblWrap = document.createElement('label'); lblWrap.className = 'f'; lblWrap.textContent = '사진 제목 (첫째 줄)';
  const sel = document.createElement('select');
  const defLbl = state.meta.defaultLabel || '합동점검 사진';
  [[ '', defLbl + ' (기본)' ], ...LABELS.map(l => [l, l]), ['__custom','직접 입력']].forEach(([v,t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
  const custom = document.createElement('input'); custom.type = 'text'; custom.placeholder = '사진 제목 입력';
  if (!p.label) sel.value = ''; else if (LABELS.includes(p.label)) sel.value = p.label; else { sel.value = '__custom'; custom.value = p.label; }
  custom.hidden = sel.value !== '__custom';
  sel.addEventListener('change', () => { custom.hidden = sel.value !== '__custom'; if (!custom.hidden) custom.focus(); });
  lblWrap.append(sel, custom);

  const descWrap = document.createElement('label'); descWrap.className = 'f'; descWrap.textContent = '설명 (괄호 안 둘째 줄)';
  const desc = document.createElement('input'); desc.type = 'text'; desc.value = p.desc || ''; desc.placeholder = '예) 관람석 하부 슬래브 철근노출 확인';
  descWrap.appendChild(desc);

  const chips = document.createElement('div'); chips.className = 'chips';
  const addChip = (txt) => { const v = desc.value.trim(); desc.value = v ? v + ' ' + txt : txt; };
  const l1 = document.createElement('span'); l1.className = 'lbl'; l1.textContent = '부재'; chips.appendChild(l1);
  PARTS.forEach(t => chips.appendChild(btn('', t, () => addChip(t))));
  const l2 = document.createElement('span'); l2.className = 'lbl'; l2.textContent = '손상·상태'; chips.appendChild(l2);
  DAMAGE.forEach(t => chips.appendChild(btn('', t, () => addChip(t))));
  chips.appendChild(btn('', '확인', () => addChip('확인')));
  chips.appendChild(btn('', '지우기', () => { desc.value = ''; }));

  const mvWrap = document.createElement('label'); mvWrap.className = 'f'; mvWrap.textContent = '들어갈 항목';
  const mv = document.createElement('select');
  state.sections.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.title; mv.appendChild(o); });
  mv.value = s.id; mvWrap.appendChild(mv);

  const order = document.createElement('div'); order.className = 'row';
  const bPrev = btn('btn','← 앞으로', () => { commit(); if (i > 0){ [s.photos[i-1], s.photos[i]] = [s.photos[i], s.photos[i-1]]; persist(); renderSections(); openSheet(s.id, p.id); } });
  const bNext = btn('btn','뒤로 →', () => { commit(); if (i < s.photos.length - 1){ [s.photos[i+1], s.photos[i]] = [s.photos[i], s.photos[i+1]]; persist(); renderSections(); openSheet(s.id, p.id); } });
  bPrev.disabled = i === 0; bNext.disabled = i === s.photos.length - 1;
  order.append(bPrev, bNext);

  const acts = document.createElement('div'); acts.className = 'row';
  const bDel = btn('btn danger','사진 삭제', () => {
    if (!confirm('이 사진을 삭제할까요?')) return;
    s.photos.splice(s.photos.indexOf(p), 1); dropPhoto(p.id); persist(); dlg.close(); renderSections();
  });
  const bOk = btn('btn primary','완료', () => { commit(); dlg.close(); renderSections(); });
  acts.append(bDel, bOk);

  function commit(){
    p.label = sel.value === '__custom' ? custom.value.trim() : sel.value;
    p.desc = desc.value.trim();
    if (mv.value !== s.id){
      const t = state.sections.find(x => x.id === mv.value);
      if (t){ s.photos.splice(s.photos.indexOf(p), 1); t.photos.push(p); }
    }
    persist();
  }
  dlg.onclose = null;
  dlg.oncancel = (e) => { commit(); renderSections(); };
  sh.append(prev, lblWrap, descWrap, chips, mvWrap, order, acts);
  if (!dlg.open) dlg.showModal();
  dlg.onclick = ev => { if (ev.target === dlg){ commit(); dlg.close(); renderSections(); } };
}

/* ---------- 저장·공유 ---------- */
function setMsg(t, err){ const m = $(listShown ? '#lmsg' : '#msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }
function setMsgAll(t, err){ ['#msg','#lmsg'].forEach(k => { const m = $(k); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }); }
const TPL = JSON.parse(document.getElementById('hwpxTpl').textContent);
const BASE = document.getElementById('hwpxBase').textContent.trim();
let downloads = null;
(async () => {
  try{ if (window.claude && window.claude.use) downloads = await window.claude.use('downloads'); }catch(e){ downloads = null; }
  if (!downloads && window.claude) setMsgAll('현재 화면(로그인 안 됨 또는 다른 앱 안의 브라우저)에서는 저장·메일 보내기가 막힐 수 있습니다. Claude 앱에 로그인한 뒤 이 링크를 열어 주세요.', true);
})();
const clean = t => String(t || '').replace(/[\\/:*?"<>|\n\r]/g,'').trim();
// 파일명 날짜: 엑셀의 점검 날짜, 없으면 오늘
function yymmdd(){ if (state.dateKey) return state.dateKey.slice(2).replace(/-/g,''); const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0'); }
function baseName(){ return `${yymmdd()}_관리주체_합동점검_결과_보고서(${clean(state.meta.facility) || '시설물명'})`; }
async function checkPhotos(){
  let lost = 0;
  for (const s of state.sections){
    for (const p of [...s.photos]){
      const b = await toFreshBlob(blobs.get(p.id));
      if (b) blobs.set(p.id, b);
      else { lost++; s.photos.splice(s.photos.indexOf(p), 1); dropPhoto(p.id); }
    }
  }
  if (lost){ persist(); renderSections(); }
  return lost;
}
async function buildReport(){
  const lost = await checkPhotos();
  if (lost) setMsg(`읽을 수 없는 사진 ${lost}장은 빼고 만들었습니다. 필요하면 다시 추가해 주세요.`, true);
  const photoMap = {};
  state.sections.forEach(s => s.photos.forEach(p => { const bl = blobs.get(p.id); if (bl) photoMap[p.id] = {bytes:bl, w:p.w, h:p.h}; }));
  const blob = await SajinHwpx.buildHwpx({meta:state.meta, sections:state.sections, attach1:app.settings.attach1}, photoMap, JSZip, TPL, BASE, 'blob');
  return new File([blob], baseName() + '.hwpx', {type:'application/hwp+zip'});
}
function photoFiles(){
  const files = []; let n = 0;
  state.sections.forEach(s => s.photos.forEach(p => {
    const bl = blobs.get(p.id); if (!bl) return; n++;
    const name = `${String(n).padStart(2,'0')}_${clean(s.title).slice(0,20)}_${clean(p.desc || p.label || state.meta.defaultLabel).slice(0,30)}.jpg`.replace(/\s+/g,' ');
    files.push(new File([bl], name, {type:'image/jpeg'}));
  }));
  return files;
}
async function busy(btn, label, fn){
  const old = btn.textContent; btn.disabled = true; btn.textContent = label;
  try{ await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}
function plainDownload(file){
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
}
// 한글 보고서 + 사진을 압축파일 하나로 (아이폰은 한 번에 여러 파일을 내려받으면 마지막 것만 남음)
async function makeBundle(report, photos){
  if (!photos.length) return report;
  const z = new JSZip(); z.file(report.name, report);
  photos.forEach(f => z.file('사진/' + f.name, f));
  return new File([await z.generateAsync({type:'blob', compression:'STORE'})], baseName() + '.zip', {type:'application/zip'});
}
$('#saveBtn').addEventListener('click', () => busy($('#saveBtn'), '파일 만드는 중…', async () => {
  try{
    if (!window.JSZip) throw {message:'문서 생성 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.'};
    const report = await buildReport();
    const photos = app.settings.withPhotos !== false ? photoFiles() : [];
    if (downloads){
      // Claude 화면에서는 .hwpx를 바로 저장할 수 없어 압축파일(.zip)로 저장
      const z = new JSZip(); z.file(report.name, report);
      photos.forEach(f => z.file('사진/' + f.name, f));
      const zb = await z.generateAsync({type:'blob', compression:'STORE'});
      const name = baseName() + '.zip';
      await downloads.save({filename:name, data:zb});
      markSaved();
      setMsg(`저장했습니다: ${name}. 압축을 풀면 한글 파일(.hwpx)${photos.length ? '과 사진 폴더' : ''}가 들어 있습니다.`);
    } else {
      const bundle = await makeBundle(report, photos);
      plainDownload(bundle); markSaved();
      setMsg(`${WHERE}에 저장했습니다: ${bundle.name}. 사파리에서 기관 웹메일에 들어가 새 메일 → 파일 첨부 → 「파일 앱 › 다운로드」에서 이 파일을 고르세요.` +
        (photos.length ? ' (한글 보고서와 사진 폴더가 함께 들어 있는 압축파일입니다)' : ''));
    }
  }catch(e){
    const code = e && e.code;
    if (code === 'declined') setMsg('저장을 취소했습니다.');
    else if (code === 'rate_limited') setMsg('저장 창이 이미 열려 있습니다. 잠시 후 다시 누르세요.', true);
    else if (code === 'too_large') setMsg('파일이 너무 큽니다. "사진 원본 파일도 함께" 옵션을 끄고 다시 저장하세요.', true);
    else setMsg((e && e.message) || '파일을 만들지 못했습니다. 다시 시도하세요.', true);
  }
}));
// ---- 공유: 휴대폰 공유창으로 한글 파일+사진 보내기 (기관 메일은 공유창에 없어 「파일에 저장」 → 사파리 웹메일 첨부가 기본) ----
let editVer = 0, prepared = null;
['input','change','click'].forEach(ev => document.getElementById('sections').addEventListener(ev, () => { editVer++; }, true));
document.getElementById('metaForm').addEventListener('input', () => { editVer++; }, true);
const WHERE = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '파일 앱 › 다운로드' : '내 파일 › 다운로드';
const SHARE_TIP = '기관 메일은 공유 창에 없습니다. 공유 창에서 「파일에 저장」을 고른 뒤, 사파리에서 기관 웹메일에 들어가 파일을 첨부하세요.';
async function prepareFiles(){
  const report = await buildReport();
  return [report, ...(app.settings.withPhotos !== false ? photoFiles() : [])];
}
async function shareNow(files){
  const data = {files};
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) throw {code:'noshare'};
  await navigator.share(data);
}
$('#mailBtn').addEventListener('click', async () => {
  const btn = $('#mailBtn');
  if (btn.disabled) return;
  try{
    if (!window.JSZip) throw {message:'문서 생성 도구를 불러오지 못했습니다. 새로고침하세요.'};
    // 이미 만들어 둔 파일이 있으면 바로 공유창 열기 (터치 직후라 막히지 않음)
    if (prepared && prepared.ver === editVer){
      await shareNow(prepared.files); markSaved();
      setMsg(SHARE_TIP);
      return;
    }
    btn.disabled = true; btn.textContent = '파일 만드는 중…';
    prepared = {ver: editVer, files: await prepareFiles()};
    btn.disabled = false; btn.textContent = '공유';
    try{
      await shareNow(prepared.files); markSaved();
      setMsg(SHARE_TIP);
    }catch(e){
      if (e && e.name === 'NotAllowedError' && navigator.share && !window.claude){
        // 파일 만드는 시간이 길어 휴대폰이 공유창을 막은 경우: 한 번 더 누르면 바로 열림
        btn.textContent = '준비 완료 · 눌러서 보내기';
        setMsg('파일이 준비됐습니다. 버튼을 한 번 더 누르면 공유창이 열립니다.');
        return;
      }
      throw e;
    }
  }catch(e){
    btn.disabled = false; if (!prepared || prepared.ver !== editVer) btn.textContent = '공유';
    if (e && e.name === 'AbortError') { setMsg('보내기를 취소했습니다.'); return; }
    if (e && (e.code === 'noshare' || e.name === 'NotAllowedError' || e.name === 'TypeError')){
      if (downloads){ setMsg('저장 창을 엽니다. 창에서 ‘메일’을 고르거나, 저장 후 메일 앱에서 첨부하세요.'); setTimeout(() => $('#saveBtn').click(), 0); }
      else if (window.claude){ setMsg('이 화면에서는 메일·저장이 막혀 있습니다. 배포용 주소(사파리·크롬)로 열어 주세요.', true); }
      else {
        // 공유창을 지원하지 않는 브라우저: 파일을 내려받고 위치 안내
        const files = (prepared && prepared.files) || await prepareFiles();
        plainDownload(await makeBundle(files[0], files.slice(1))); markSaved();
        setMsg(`이 브라우저는 공유 창을 지원하지 않아 ${WHERE}에 저장했습니다. 사파리에서 기관 웹메일에 들어가 새 메일 → 파일 첨부 → 「파일 앱 › 다운로드」에서 이 파일을 고르세요.`, true);
      }
      return;
    }
    setMsg((e && e.message) || '보내기를 준비하지 못했습니다.', true);
  }
});
// 네이버·카카오톡 등 앱 안의 브라우저 안내
if (/NAVER|KAKAOTALK|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(navigator.userAgent)){
  setMsgAll('지금은 다른 앱 안의 브라우저입니다. 메뉴(⋯)에서 ‘다른 브라우저로 열기’(사파리·크롬)를 누르면 메일 보내기가 됩니다.', true);
}

function markSaved(){ if (state){ state.savedAt = new Date().toISOString(); persist(); } showCopyTo(); }
// 저장·공유 뒤 「받는 주소 복사」 (설정에 보고서 받을 메일 주소를 넣은 경우. 첨부는 메일 앱에서 직접)
function showCopyTo(){
  const b = $('#copyToBtn'), to = app.settings.reportTo;
  b.hidden = !to; if (!to) return;
  b.textContent = `받는 주소 복사 (${to})`;
  b.onclick = async () => { try{ await navigator.clipboard.writeText(to); b.textContent = '복사했습니다 · 메일 받는 사람 칸에 붙여 넣으세요'; }catch(e){ b.textContent = to; } };
}

// 이 시설물 보고서만 비우기 (목록의 다른 시설물은 그대로, 엑셀에서 온 기본정보는 다시 채움)
$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('이 시설물의 사진·의견·직접 고친 기본정보를 모두 지울까요?\n(목록의 다른 시설물은 그대로 남습니다)')) return;
  state.sections.forEach(s => s.photos.forEach(p => dropPhoto(p.id)));
  Object.assign(state, {meta:defaultMeta(), sections:defaultSections(), edited:[], managers:0, savedAt:null});
  if (state.src) IMP.applyRow(state, state.src, app.settings);
  editVer++; persist(); render(); setMsg('이 시설물 보고서를 비웠습니다.');
  $('#metaBox').open = true;
});

/* ---------- 대상 목록 화면 ---------- */
// 대상목록은 기관 메일로 받은 암호화 파일(.sajin)로만 들어온다. 외부 서버에서 받거나 보내지 않는다.
const localKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const LC = window.SajinListCrypto;
const CRYPTO = window.SAJIN_CRYPTO || {salts:[]};      // 빌드할 때 data/crypto.json(솔트, 비밀 아님)을 내장
const T = () => app.team || (app.team = {lists:{}, myName:'', nameAsked:false, chosen:{}});
const listIds = () => Object.keys(T().lists);
// 보는 팀: 내 이름(공백 무시)이 출장자 명단에 있는 목록, 없으면 직접 고른 목록
function visibleLists(){
  const L = T().lists, me = LC.normName(T().myName);
  const byName = me ? listIds().filter(id => (L[id].members || []).includes(me)) : [];
  return byName.length ? byName : listIds().filter(id => T().chosen[id]);
}
const shortBatch = s => { const m = /(\d+)\s*년\s*(\d+)\s*차/.exec(s || ''); return m ? `${m[1]}년 ${m[2]}차` : (s || ''); };
const dateRange = ds => { const a = (ds || []).map(k => IMP.dayLabel(k).replace(/ \(.\)$/, '')); return a.length > 1 ? `${a[0]}~${a[a.length-1]}` : (a[0] || ''); };
const listTitle = L => `${L.teamName} · ${shortBatch(L.batchName)}`;

function renderList(){
  const blocking = renderTeamCards(), vis = blocking ? [] : visibleLists(), ids = listIds(), L = T().lists;
  const shown = app.sites.filter(s => !s.listId || vis.includes(s.listId));
  const others = blocking ? [] : app.sites.filter(s => s.listId && !vis.includes(s.listId));
  if (vis.length){
    const t = vis.map(id => L[id]);
    $('#hdrSub').textContent = shortBatch(t[0].batchName) || '대상 목록';
    $('#batchName').textContent = t.map(x => x.teamName).join(' · ');
    $('#batchCount').textContent = `· ${shortBatch(t[0].batchName)} · ${shown.length}곳`;
  } else {
    $('#hdrSub').textContent = app.batch ? app.batch.name : '대상 목록';
    $('#batchName').textContent = app.batch ? app.batch.name : (shown.length ? '작성 중인 보고서' : '대상 목록');
    $('#batchCount').textContent = shown.length ? `· ${shown.length}개 시설` : '';
  }
  const li = $('#listInfo'); li.innerHTML = ''; li.hidden = !vis.length;
  vis.forEach(id => { const b = btn('linkbtn', `이 목록 지우기 (${L[id].teamName})`, () => removeList(id)); li.appendChild(b); });
  $('#clearListBtn').hidden = !app.sites.length;
  const box = $('#siteList'); box.innerHTML = '';
  const ot = $('#otherTeams'); ot.innerHTML = '';
  // 여러 팀을 볼 때는 팀 이름, 엑셀을 직접 불러온 목록은 「이 휴대폰에서만」, 지시서 2 방식으로 받은 목록은 「이전 방식으로 받은 목록」
  const tagOf = s => s.listId ? (vis.length > 1 ? L[s.listId].teamName : '')
    : s.slot != null ? '이전 방식으로 받은 목록' : (s.src && ids.length ? '이 휴대폰에서만' : '');
  if (!shown.length && !others.length && !blocking){
    const e = el('div', 'block empty');
    e.append(el('b', null, '등록된 대상 목록이 없습니다'),
      el('p', null, '팀장 PC 화면이나 인쇄물의 QR을 위의 「QR 찍기」로 찍거나, 기관 메일로 받은 첨부파일을 「목록 파일 불러오기」로 여세요.'));
    const ol = el('ol', 'steps');
    ['사파리로 기관 웹메일에 들어가 첨부파일(대상목록_….sajin) 내려받기 (파일 앱 › 다운로드에 저장됨)', '이 화면의 「목록 파일 불러오기」 → 저장한 파일 선택', '처음 한 번만 우리 팀 비밀번호와 내 이름 입력 → 우리 팀 목록'].forEach(t => ol.appendChild(el('li', null, t)));
    e.append(ol, el('p', null, '목록 없이 쓰려면 「직접 입력해서 시작」을 누르세요.'));
    box.appendChild(e); return;
  }
  IMP.groupByDate(shown, localKey(new Date())).forEach(g => {
    const h = el('h2', 'day', g.label); h.appendChild(el('span', null, ` ${g.sites.length}곳`));
    if (g.today) h.appendChild(el('em', 'today', '오늘'));
    box.appendChild(h);
    g.sites.forEach(s => box.appendChild(siteCard(s, tagOf(s))));
  });
  if (others.length){
    const d = el('details', 'others'), lists = [...new Set(others.map(s => s.listId))];
    d.appendChild(el('summary', null, `다른 팀 보기 (${lists.length}팀)`));
    lists.forEach(id => {
      const h = el('h3', 'day', L[id].teamName);
      h.append(el('span', null, ` ${shortBatch(L[id].batchName)} · ${dateRange(L[id].dates)}`), btn('linkbtn', '이 목록 지우기', () => removeList(id)));
      d.appendChild(h);
      others.filter(s => s.listId === id).sort((a, b) => (a.no || 0) - (b.no || 0)).forEach(s => d.appendChild(siteCard(s)));
    });
    ot.appendChild(d);
  }
}
function siteCard(s, team){
  const m = s.meta, card = el('article', 'block site' + (s.removed ? ' removed' : ''));
  const open = el('button', 'site-open'); open.type = 'button';
  const l1 = el('div', 'st1');
  l1.append(el('span', 'no', s.no || '·'), el('b', 'nm', m.facility || '(시설물명 없음)'));
  const sg = s.src ? s.src.safetyGrade : '';
  const tags = el('span', 'tags');
  if (team) tags.appendChild(el('span', 'tag team', team));
  if (m.grade) tags.appendChild(el('span', 'tag', m.grade));
  if (sg) tags.appendChild(el('span', 'tag' + (/^[DE]/i.test(sg) ? ' alert' : ''), sg));
  l1.appendChild(tags);
  const l2 = el('div', 'st2', [m.location, s.buildings ? s.buildings + '개동' : '', s.src && s.src.ampm].filter(Boolean).join(' · '));
  const l3 = el('div', 'st3');
  const pc = photoCount(s);
  l3.appendChild(el('span', 'state' + (s.savedAt ? ' done' : pc ? ' doing' : ''), s.savedAt ? `저장함 · 사진 ${pc}장` : `사진 ${pc}장`));
  if (s.removed) l3.appendChild(el('span', 'tag alert', '목록에서 빠짐'));
  if (s.contact) l3.appendChild(el('span', 'who', '담당 ' + s.contact));
  open.append(l1, l2, l3);
  open.addEventListener('click', () => openSite(s.id));
  card.appendChild(open);
  const acts = el('div', 'acts');
  const tel = String(s.phone || '').replace(/[^\d+]/g, '');
  if (tel){ const a = el('a', 'btn sm', '전화'); a.href = 'tel:' + tel; a.setAttribute('aria-label', (m.facility || '') + ' 전화 ' + s.phone); acts.appendChild(a); }
  if (m.location){
    // 누를 때만 지도 서비스로 주소를 보냄 (자동 전송 없음)
    const a = el('a', 'btn sm', '지도'); a.href = 'https://map.naver.com/p/search/' + encodeURIComponent(m.location);
    a.target = '_blank'; a.rel = 'noopener noreferrer'; acts.appendChild(a);
  }
  if (s.removed || !s.src || s.slot != null){
    const d = el('button', 'btn sm dangertxt', '삭제'); d.type = 'button';
    d.addEventListener('click', () => removeSite(s)); acts.appendChild(d);
  }
  if (acts.children.length) card.appendChild(acts);
  return card;
}
const sitePhotoIds = s => s.sections.flatMap(x => x.photos.map(p => p.id));
function removeSite(s){
  const pc = photoCount(s);
  if (!confirm(`「${s.meta.facility || '이 시설물'}」 보고서${pc ? `와 사진 ${pc}장` : ''}을 삭제할까요?`)) return;
  sitePhotoIds(s).forEach(delPhoto);
  app.sites = app.sites.filter(x => x !== s); persist(); renderList();
}
// 목록 하나 지우기 (사진이 있으면 한 번 더 확인)
function removeList(id){
  const L = T().lists[id]; if (!L) return;
  const ss = app.sites.filter(s => s.listId === id), pc = ss.reduce((a, s) => a + photoCount(s), 0);
  if (!confirm(`「${listTitle(L)}」 목록(${ss.length}곳)을 이 휴대폰에서 지울까요?`)) return;
  if (pc && !confirm(`사진이 있는 시설물 ${ss.filter(s => photoCount(s)).length}곳(사진 ${pc}장)도 함께 지워집니다. 보고서를 보냈는지 확인하셨나요?`)) return;
  ss.forEach(s => sitePhotoIds(s).forEach(delPhoto));
  app.sites = app.sites.filter(s => s.listId !== id); delete T().lists[id]; delete T().chosen[id];
  persist(); renderList(); setMsg(`「${listTitle(L)}」 목록을 지웠습니다.`);
}
async function wipeAll(){
  await tx('photos','readwrite', s => s.clear());
  app.sites = []; app.batch = null; app.activeId = null; T().lists = {}; T().chosen = {};
  await persistNow();
}
// 엑셀을 직접 불러온 시설물만 지우기 (메일로 받은 목록은 그대로)
async function wipeLocal(){
  app.sites.filter(s => !s.listId).forEach(s => sitePhotoIds(s).forEach(delPhoto));
  app.sites = app.sites.filter(s => s.listId); app.batch = null;
  await persistNow();
}
$('#clearListBtn').addEventListener('click', async () => {
  const pc = app.sites.reduce((a, s) => a + photoCount(s), 0);
  if (!confirm(`목록의 시설물 ${app.sites.length}곳${pc ? `과 사진 ${pc}장` : ''}을 이 휴대폰에서 모두 지울까요? 되돌릴 수 없습니다.`)) return;
  await wipeAll(); renderList(); setMsg('목록을 비웠습니다.');
});
$('#manualBtn').addEventListener('click', () => {
  const s = newSite(null); s.no = app.sites.reduce((a, x) => Math.max(a, x.no || 0), 0) + 1;
  app.sites.push(s); openSite(s.id);
});

/* ---------- 목록 파일 불러오기: .sajin(암호화 목록) · .xlsx(비상용) · 예전 .json ---------- */
// 아이폰 파일 선택 창에서 .sajin 이 흐리게 막히지 않도록 accept 를 지정하지 않고 내용으로 판별
$('#listFileBtn').addEventListener('click', () => { const fi = $('#listIn'); fi.value = ''; fi.click(); });
$('#listIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try{ await openListFile(f); }catch(err){ setMsg(err.message || '파일을 열지 못했습니다.', true); }
});
async function openListFile(f){
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf[0] === 0x50 && buf[1] === 0x4B){              // zip = 엑셀(.xlsx)
    if (!window.JSZip) throw new Error('엑셀을 여는 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.');
    let sheets;
    try{ sheets = (await SajinXlsx.readXlsx(buf, JSZip)).sheets; }catch(e){ throw new Error('대상목록 파일이 아닙니다. 팀장에게 받은 메일의 첨부파일(.sajin)을 고르세요.'); }
    showPreview(IMP.parseWorkbook(sheets), '엑셀'); return;
  }
  let o = null;
  if (buf.length < 2000000){ try{ o = JSON.parse(new TextDecoder().decode(buf).replace(/^﻿/, '')); }catch(e){} }
  if (o && o.type === 'sajin-list') return openSajin(o);
  if (o && o.v === 1 && Array.isArray(o.r)) return showPreview(Object.assign(IMP.unpackList(o), {warnings:[]}), '목록 파일');
  throw new Error('대상목록 파일이 아닙니다. 팀장에게 받은 메일의 첨부파일(.sajin)을 고르세요.');
}

// 팀 비밀번호 키: 비밀번호는 저장하지 않고, 꺼낼 수 없는 키(CryptoKey)만 IndexedDB 'listKeys'에 둔다
// 팀마다 비밀번호가 다르므로 솔트별로 여러 개: {솔트 이름: [{key, addedAt}, …]} (열 때 차례로 맞춰 봄)
let keys = null, keyState = '', pendingFile = null, fails = 0, lockUntil = 0;
const saveKeys = () => tx('kv','readwrite', s => s.put(keys, 'listKeys'));
async function loadKeys(){
  if (keys) return keys;
  try{ keys = (await getKV(await idb(), 'listKeys')) || {}; }catch(e){ keys = {}; }
  Object.keys(keys).forEach(id => { if (!Array.isArray(keys[id])) keys[id] = keys[id] && keys[id].key ? [keys[id]] : []; });   // 예전(솔트당 1개) 형식
  // 새 솔트 키를 받은 지 2주가 지나면 이전 솔트 키는 지움
  const cur = LC.currentSalt(CRYPTO), ck = cur && keys[cur.id];
  if (ck && ck.length && Date.now() - Math.min(...ck.map(k => k.addedAt)) > 14 * 864e5){
    const old = Object.keys(keys).filter(id => id !== cur.id);
    if (old.length){ old.forEach(id => delete keys[id]); saveKeys(); }
  }
  return keys;
}
const keyCount = () => Object.values(keys || {}).reduce((a, l) => a + l.length, 0);
async function findKey(file, saltId){
  for (const k of (keys[saltId] || [])) if (await keyOk(k.key, file)) return k.key;
  return null;
}
async function openSajin(file){
  if (!LC.isEncFile(file)) throw new Error('대상목록 파일이 손상되었습니다. 팀장에게 다시 받아 주세요.');
  const salt = LC.saltById(CRYPTO, file.kdf && file.kdf.saltId);
  if (!salt) throw new Error('이 목록 파일은 더 새로운 앱에서 만들어졌습니다. 앱을 새로고침해 최신 버전으로 바꾼 뒤 다시 불러오세요.');
  return openWithKey(file, salt);
}
// 저장된 키는 이미 받은 목록(같은 listId)의 새 판에만 쓴다. 처음 받는 목록은 키가 맞아도 팀 비밀번호를 한 번 입력받는다
async function openWithKey(file, salt){
  await loadKeys();
  const k = await findKey(file, salt.id);
  if (k){
    const c = file.qr ? await QR.decrypt(k, file.qr) : await LC.decryptList(k, file);
    if (c && c.listId && T().lists[String(c.listId).slice(0, 64)]) return applyListFile(k, file);
  }
  pendingFile = file; file.hadKey = !!k; keyState = k || !keyCount() ? 'need' : 'other';
  renderList(); window.scrollTo(0, 0);
  const pi = $('#passIn'); if (pi) pi.focus();
}
async function submitPass(pw, out, b){
  if (Date.now() < lockUntil){ out.textContent = `잠시 후 다시 입력하세요 (${Math.ceil((lockUntil - Date.now()) / 1000)}초)`; return; }
  const file = pendingFile; if (!file) return;
  const salt = LC.saltById(CRYPTO, file.kdf.saltId);
  b.disabled = true; b.textContent = '확인 중…'; out.textContent = '';
  try{
    const key = await LC.deriveKey(pw, salt.salt, CRYPTO.iter);
    if (!(await keyOk(key, file))){
      if (++fails >= 5){ fails = 0; lockUntil = Date.now() + 30000; out.textContent = '비밀번호가 5번 틀렸습니다. 30초 뒤에 다시 입력하세요.'; }
      else out.textContent = file.qr ? QR_BAD : '비밀번호가 맞지 않습니다.';
      return;
    }
    fails = 0;
    if (!file.hadKey){ keys[salt.id] = (keys[salt.id] || []).concat([{key, addedAt:Date.now()}]).slice(-20); await saveKeys(); }
    pendingFile = null; keyState = '';
    await applyListFile(key, file);
  }catch(e){ out.textContent = e.message || '확인하지 못했습니다.'; }
  finally{ b.disabled = false; b.textContent = '확인'; }
}
// 목록 반영: 같은 listId 새 판은 지시서 1 다시 불러오기 규칙(사진·직접 고친 값 보존), 옛 판은 무시
// file: 목록 파일(.sajin) 또는 QR 로 받은 묶음 {qr:{saltId, iv, ct}, kdf:{saltId}}
const keyOk = (key, file) => file.qr ? QR.check(key, file.qr) : LC.checkKey(key, file);
async function applyListFile(key, file){
  const c = file.qr ? await QR.decrypt(key, file.qr) : await LC.decryptList(key, file);
  if (!c || !c.listId || !Array.isArray(c.sites)) throw new Error('대상목록 파일 내용이 올바르지 않습니다.');
  const id = String(c.listId).slice(0, 64), prev = T().lists[id];
  const vs = LC.versionState(prev && prev.listVersion, c.listVersion);
  if (vs === 'old'){ renderList(); setMsg(`이미 더 최신 목록이 있습니다 (${listTitle(prev)}). 이 ${file.qr ? 'QR' : '파일'}은 불러오지 않았습니다.`, true); return; }
  if (vs === 'same'){ renderList(); setMsg(`${file.qr ? '이미 등록된 목록입니다' : '이미 불러온 목록입니다'} (${listTitle(prev)}, 바뀐 내용 없음).`); return; }
  const team = c.team || {}, batch = c.batch || {}, rows = IMP.cleanRows(c.sites);
  const teamName = String(team.name || '팀').slice(0, 60), legacy = app.legacySlots || {};
  const own = app.sites.filter(s => s.listId === id);
  // 이 휴대폰에서 직접 불러온 엑셀, 이전 방식(지시서 2)으로 받은 같은 팀 목록의 같은 시설물은 하나로 합침
  const cand = own.concat(app.sites.filter(s => !s.listId && s.src && (s.slot == null || !legacy[s.slot] || legacy[s.slot] === teamName)));
  const r = IMP.mergeSites(cand, rows, {sameBatch:false, settings:app.settings, makeSite: row => Object.assign(newSite(row), {listId:id})});
  r.matched.forEach(s => { s.listId = id; delete s.slot; });
  own.forEach(s => { if (!r.matched.includes(s)){ s.removed = true; r.missing++; } });
  app.sites = app.sites.filter(s => !cand.includes(s)).concat(r.sites);
  T().lists[id] = {listVersion:String(c.listVersion), teamName, members:(team.members || []).map(LC.normName),
    batchId:String(batch.id || ''), batchName:String(batch.name || ''), dates:(batch.dates || []).slice(0, 31), count:rows.length, importedAt:new Date().toISOString()};
  await persistNow(); renderList();
  const t = listTitle(T().lists[id]);
  const hidden = T().nameAsked && !visibleLists().includes(id) ? ' 내 팀 목록이 아니어서 「다른 팀 보기」에 넣었습니다.' : '';
  setMsg((prev ? `${t} 목록을 갱신했습니다: 갱신 ${r.updated}곳, 추가 ${r.added}곳${r.missing ? `, 목록에서 빠짐 ${r.missing}곳(사진 보호를 위해 지우지 않음)` : ''}.`
    : `${t} · ${rows.length}곳을 등록했습니다.`) + hidden);
}
function card(title, sub){ const c = el('section', 'block keycard'); c.appendChild(el('b', null, title)); if (sub) c.appendChild(el('p', 'sub', sub)); return c; }
function keyCard(){
  const qrNote = pendingFile && pendingFile.qr ? ' QR이 손상되었을 수도 있으니, 맞는 비밀번호인데도 안 되면 QR을 다시 찍어 주세요.' : '';
  const c = keyState === 'other'
    ? card('이 목록의 팀 비밀번호를 입력하세요', '다른 팀 목록이거나 팀 비밀번호가 바뀌었습니다. 이 목록 팀의 비밀번호를 입력하세요 (팀마다 다릅니다). 휴대폰의 사진·작성 내용은 그대로 있습니다.' + qrNote)
    : card('팀 비밀번호를 입력하세요', '우리 팀 비밀번호를 입력하세요 (팀마다 다릅니다). 처음 받는 목록은 한 번 입력해야 등록됩니다 (같은 목록의 새 판은 다시 묻지 않음). 비밀번호는 팀장에게 구두나 내부 메신저로 받으세요.' + qrNote);
  const i = document.createElement('input'); i.type = 'password'; i.id = 'passIn'; i.autocomplete = 'current-password'; i.setAttribute('aria-label', '팀 비밀번호');
  const out = el('p', 'msg err'); out.setAttribute('role', 'alert');
  const b = btn('btn primary', '확인', () => submitPass(i.value, out, b));
  i.addEventListener('keydown', e => { if (e.key === 'Enter') b.click(); });
  const row = el('div', 'row inrow'); row.append(i, b);
  c.append(row, out, btn('linkbtn', '취소', () => { pendingFile = null; keyState = ''; renderList(); }));
  return c;
}
function nameCard(){
  const c = card('내 이름 (선택)', '엑셀 출장자 열의 이름과 같으면 우리 팀 목록만 자동으로 보입니다. 이름은 이 휴대폰에만 저장됩니다.');
  const i = document.createElement('input'); i.type = 'text'; i.id = 'nameIn'; i.value = T().myName || ''; i.placeholder = '예) 홍길동'; i.setAttribute('aria-label', '내 이름');
  const done = name => { T().myName = name; T().nameAsked = true; persist(); renderList(); };
  const row = el('div', 'row'); row.append(btn('btn', '건너뛰기', () => done('')), btn('btn primary', '확인', () => done(i.value.trim())));
  i.addEventListener('keydown', e => { if (e.key === 'Enter') done(i.value.trim()); });
  c.append(i, row); return c;
}
function teamPicker(){
  const c = card('어느 팀 목록을 볼까요?', T().myName
    ? `「${T().myName}」 이름이 들어 있는 목록이 없습니다. 볼 팀을 고르세요 (여러 팀 선택 가능).` : '볼 팀을 고르세요 (여러 팀 선택 가능).');
  const picks = new Set();
  listIds().forEach(id => {
    const s = T().lists[id], l = el('label', 'pick'), x = document.createElement('input'); x.type = 'checkbox';
    x.addEventListener('change', () => { if (x.checked) picks.add(id); else picks.delete(id); });
    const t = el('span'); t.append(el('b', null, s.teamName), el('span', 'sub', ` ${shortBatch(s.batchName)} · ${dateRange(s.dates)} · ${s.count}곳`));
    l.append(x, t); c.appendChild(l);
  });
  c.appendChild(btn('btn primary', '선택한 팀 목록 보기', () => {
    if (!picks.size) return;
    picks.forEach(id => { T().chosen[id] = T().lists[id].batchId || '-'; }); persist(); renderList();
  }));
  return c;
}
// 비밀번호·이름·팀 선택 카드. 이름·팀 선택 중이면 true (목록 대신 카드를 보여줌)
function renderTeamCards(){
  const box = $('#remoteBox'); box.innerHTML = '';
  if (qrHold) box.appendChild(otherBrowserCard());
  qrPending().forEach(([bid, b]) => box.appendChild(qrProgCard(bid, b)));
  if (pendingFile) box.appendChild(keyCard());
  if (!listIds().length) return false;
  if (!T().nameAsked){ box.appendChild(nameCard()); return true; }
  if (!visibleLists().length){ box.appendChild(teamPicker()); return true; }
  return false;
}

// 설정(⋯): 이름·팀·비밀번호, 보고서 받을 메일 주소, 불러온 목록 지우기
$('#setBtn').addEventListener('click', () => {
  const sh = $('#sheet'); sh.innerHTML = '';
  sh.appendChild(el('h3', 'ptitle', '설정'));
  const close = fn => async () => { dlg.close(); await fn(); };
  sh.appendChild(el('p', 'sub', `내 이름: ${T().myName || '(입력 안 함)'} · 보는 팀: ${visibleLists().map(id => T().lists[id].teamName).join(', ') || '없음'}`));
  const row = el('div', 'row');
  row.append(btn('btn', '내 이름 바꾸기', close(() => { T().nameAsked = false; persist(); renderList(); })),
    btn('btn', '팀 다시 고르기', close(() => { T().chosen = {}; T().myName = ''; T().nameAsked = false; persist(); renderList(); })));
  sh.appendChild(row);
  const ml = el('label', 'f', '보고서 받을 메일 주소 (선택, 이 휴대폰에만 저장)');
  const mi = document.createElement('input'); mi.type = 'email'; mi.id = 'reportToIn'; mi.value = app.settings.reportTo || ''; mi.placeholder = '예) 담당자 기관 메일 주소';
  mi.addEventListener('input', () => { app.settings.reportTo = mi.value.trim(); persist(); });
  ml.appendChild(mi); sh.appendChild(ml);
  if (listIds().length){
    sh.appendChild(el('b', null, '불러온 목록'));
    listIds().forEach(id => {
      const L = T().lists[id], r = el('div', 'lrow');
      r.append(el('span', null, `${listTitle(L)} · ${L.count}곳`), btn('btn sm dangertxt', '지우기', close(() => removeList(id))));
      sh.appendChild(r);
    });
  }
  sh.appendChild(btn('btn', '팀 비밀번호 다시 입력', close(async () => {
    keys = {}; await saveKeys(); setMsg('저장된 팀 비밀번호 키를 지웠습니다. 다음에 목록 파일을 불러올 때 비밀번호를 묻습니다.');
  })));
  sh.appendChild(btn('btn dangertxt', '이 휴대폰에서 대상 목록·키 모두 지우기', close(async () => {
    const rs = app.sites.filter(s => s.listId || s.slot != null), pc = rs.reduce((a, s) => a + photoCount(s), 0);
    if (!confirm(`팀 비밀번호 키와 메일로 받은 목록의 시설물 ${rs.length}곳${pc ? `(사진 ${pc}장 포함)` : ''}을 이 휴대폰에서 지울까요?`)) return;
    rs.forEach(s => sitePhotoIds(s).forEach(delPhoto));
    app.sites = app.sites.filter(s => !s.listId && s.slot == null); app.team = null; app.legacySlots = null;
    keys = {}; await saveKeys(); pendingFile = null; keyState = '';
    await persistNow(); renderList(); setMsg('대상 목록과 키를 지웠습니다.');
  })));
  sh.appendChild(btn('btn', '닫기', () => dlg.close()));
  dlg.oncancel = null; dlg.onclose = null;
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  if (!dlg.open) dlg.showModal();
});

// 예전 평문 공유 링크(#list=)는 더 이상 받지 않음 (시설 정보가 주소에 그대로 들어가므로)
function clearHash(){ if (/^#list=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
function checkHash(){
  if (!/^#list=/.test(location.hash)) return;
  clearHash();
  if (!listShown) showList();
  setMsg('목록 공유 링크는 더 이상 지원하지 않는 방식입니다. 팀장에게 목록 파일(.sajin)을 기관 메일로 받아 「목록 파일 불러오기」를 눌러 주세요.', true);
}
window.addEventListener('hashchange', () => {
  if (/^#q=/.test(location.hash) && !adminMode){ const h = location.hash; history.replaceState(null, '', location.pathname + location.search); receiveQr(h, false); return; }
  if ((location.hash === '#admin') !== adminMode) location.reload(); else checkHash();
});

/* ---------- QR 로 목록 받기: 카메라 앱으로 찍어 열린 주소(#q=) · 앱 안 「QR 찍기」 (src/qrcodec.js) ---------- */
// 받다 만 조각은 IndexedDB 'qrParts' {묶음 식별값: {n, parts:{번호:데이터}, at}} 에 두고 24시간 뒤 지운다. 다 모이면 풀어서 등록
const QR = window.SajinQR, QR_TTL = 24 * 36e5;
const QR_BAD = '팀 비밀번호가 맞지 않거나 QR이 손상되었습니다. 비밀번호를 다시 입력하거나 QR을 다시 찍어 주세요.';
let qrBundles = {}, qrHold = null, qrHere = false;
const saveQrParts = () => tx('kv','readwrite', s => s.put(qrBundles, 'qrParts'));
async function loadQrParts(){
  try{ qrBundles = (await getKV(await idb(), 'qrParts')) || {}; }catch(e){ qrBundles = {}; }
  const old = Object.keys(qrBundles).filter(b => !(Date.now() - qrBundles[b].at < QR_TTL));
  if (old.length){ old.forEach(b => delete qrBundles[b]); saveQrParts(); }
}
const qrPending = () => Object.entries(qrBundles).filter(([, b]) => Date.now() - b.at < QR_TTL && !QR.isComplete(b));
const qrProgText = b => `목록 QR ${QR.received(b).length} / ${b.n} 받음 — 나머지 QR을 찍어 주세요`;
// 기본 카메라가 평소와 다른 브라우저(삼성 인터넷 등)로 열었을 수 있을 때: 이 브라우저에 자료가 하나도 없으면 먼저 안내
const ODD_BROWSER = /SamsungBrowser|Whale|EdgA|EdgiOS|FxiOS|Firefox|OPR\/|OPT\//i.test(navigator.userAgent);
async function receiveQr(text, scanned){
  const p = QR.parsePart(text);
  if (!p){ if (!listShown) showList(); setMsg('이 앱용 QR이 아닙니다.', true); return null; }
  if (!scanned && !qrHere && ODD_BROWSER && !app.sites.length && (await loadKeys(), !keyCount())){
    qrHold = p; if (!listShown) showList(); renderList(); window.scrollTo(0, 0); return null;
  }
  const b = qrBundles[p.bid] || (qrBundles[p.bid] = {n:p.n, parts:{}, at:Date.now()});
  const done = QR.addPart(b, p);
  if (!done){ await saveQrParts(); if (!listShown) showList(); renderList(); setMsg(qrProgText(b)); return b; }
  delete qrBundles[p.bid]; await saveQrParts();
  if (!listShown) showList();
  try{ await openQR(QR.join(b)); }catch(e){ renderList(); setMsg(e.message || 'QR을 읽지 못했습니다.', true); }
  return b;
}
async function openQR(payload){
  const salt = LC.saltById(CRYPTO, payload.saltId);
  if (!salt) throw new Error('이 QR은 더 새로운 앱에서 만들어졌습니다. 앱을 새로고침해 최신 버전으로 바꾼 뒤 다시 찍어 주세요.');
  return openWithKey({qr:payload, kdf:{saltId:salt.id}}, salt);
}
function qrProgCard(bid, b){
  const c = card(qrProgText(b), '여러 장이면 순서 상관없이 모두 찍으세요. 받다 만 QR은 24시간 뒤 지워집니다.'); c.classList.add('qrprog');
  const chips = el('div', 'chips'), got = QR.received(b);
  for (let i = 1; i <= b.n; i++) chips.appendChild(el('span', got.includes(i) ? 'got' : '', `${i}번${got.includes(i) ? ' 받음' : ''}`));
  const row = el('div', 'row');
  row.append(btn('btn primary', 'QR 찍기', openScanner), btn('btn', '그만 받기', () => { delete qrBundles[bid]; saveQrParts(); renderList(); setMsg(''); }));
  c.append(chips, row); return c;
}
function otherBrowserCard(){
  const c = card('평소 쓰는 브라우저인가요?', '평소 쓰는 브라우저가 아니면 목록이 따로 저장됩니다. 평소 쓰는 브라우저에서 앱을 열고 「QR 찍기」로 찍어 주세요.');
  const row = el('div', 'row');
  row.append(btn('btn primary', '여기에 그냥 등록', () => { const p = qrHold; qrHold = null; qrHere = true; receiveQr(`#q=${p.i}.${p.n}.${p.bid}.${p.data}`, false); }),
    btn('btn', '취소', () => { qrHold = null; renderList(); }));
  c.appendChild(row); return c;
}
// 앱 안 QR 찍기: 후면 카메라 → BarcodeDetector(있으면) 또는 jsQR. 여러 장이면 카메라를 켠 채로 계속, 다 모이면 닫고 등록
let scanStop = null;
async function openScanner(){
  const sh = $('#sheet'); sh.innerHTML = '';
  sh.appendChild(el('h3', 'ptitle', 'QR 찍기'));
  const v = document.createElement('video'); v.setAttribute('playsinline', ''); v.muted = true; v.autoplay = true;
  const st = el('p', 'msg'); st.id = 'scanMsg'; st.setAttribute('role', 'status'); st.textContent = '카메라를 켜는 중…';
  const w = el('div', 'scan');
  w.append(v, st, el('p', 'sub', '팀장 PC 화면이나 인쇄물의 QR을 비추세요. 여러 장이면 순서 상관없이 차례로 비추세요.'), btn('btn', '닫기', () => dlg.close()));
  sh.appendChild(w);
  dlg.oncancel = null; dlg.onclick = null;
  dlg.onclose = () => { if (scanStop) scanStop(); };
  if (!dlg.open) dlg.showModal();
  let stream;
  try{
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera');
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
  }catch(e){ st.className = 'msg err'; st.textContent = '카메라를 쓸 수 없습니다. 설정에서 카메라 권한을 허용하거나, 기본 카메라 앱으로 QR을 찍어 주세요.'; return; }
  if (!dlg.open){ stream.getTracks().forEach(t => t.stop()); return; }
  let alive = true, last = '', det = null;
  scanStop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); scanStop = null; };
  v.srcObject = stream; v.play().catch(() => {});
  try{ if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) det = new BarcodeDetector({formats:['qr_code']}); }catch(e){ det = null; }
  st.textContent = 'QR을 비추세요';
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', {willReadFrequently:true});
  const tick = async () => {
    if (!alive) return;
    let text = null;
    if (v.readyState >= 2 && v.videoWidth){
      try{
        if (det){ const r = await det.detect(v); if (r[0]) text = r[0].rawValue; }
        else {
          const cw = Math.min(v.videoWidth, 960), ch = Math.round(v.videoHeight * cw / v.videoWidth);
          cv.width = cw; cv.height = ch; cx.drawImage(v, 0, 0, cw, ch);
          const r = window.jsQR(cx.getImageData(0, 0, cw, ch).data, cw, ch, {inversionAttempts:'dontInvert'});
          if (r) text = r.data;
        }
      }catch(e){ det = null; }
    }
    if (text && text !== last){
      last = text;
      const p = QR.parsePart(text);
      if (!p){ st.className = 'msg err'; st.textContent = '이 앱용 QR이 아닙니다.'; }
      else {
        const had = (qrBundles[p.bid] || {}).parts;
        if (QR.isComplete({n:p.n, parts:Object.assign({}, had, {[p.i]:p.data})})){ dlg.close(); await receiveQr(text, true); return; }
        const b = await receiveQr(text, true);
        st.className = 'msg'; st.textContent = `${qrProgText(b)} (받은 번호: ${QR.received(b).join(', ')})`;
      }
    }
    if (alive) setTimeout(tick, 150);
  };
  tick();
}
$('#qrBtn').addEventListener('click', openScanner);

function showPreview(data, from){
  const sh = $('#sheet'); sh.innerHTML = '';
  sh.appendChild(el('h3', 'ptitle', `${data.name || '대상 목록'} · ${data.rows.length}개 시설`));
  sh.appendChild(el('p', 'sub', `${from}에서 읽은 목록입니다 (이 휴대폰에서만 쓰는 비상용). 내용을 확인하고 「등록」을 누르세요.`));
  const ul = el('ul', 'plist');
  data.rows.forEach(r => {
    const li = el('li'); li.append(el('span', 'no', r.no), el('b', null, r.facility));
    li.appendChild(el('span', 'sub', ' ' + [r.dateKey ? IMP.dayLabel(r.dateKey) : '', r.ampm, r.safetyGrade].filter(Boolean).join(' · ')));
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  sh.appendChild(el('p', 'sub', '자동으로 채워지는 항목: 시설물명 · 관리주체(수신처) · 위치 · 종류 · 구분(종별) · 준공일 · 안전등급 · 점검자 인원 · 점검기간·표지 날짜. 층수·연면적·최고높이는 현장에서 입력합니다.'));
  if (data.warnings && data.warnings.length){
    const w = el('div', 'warnbox'); w.appendChild(el('b', null, '확인이 필요한 칸'));
    data.warnings.forEach(t => w.appendChild(el('div', null, t)));
    sh.appendChild(w);
  }
  let mode = 'merge';
  const local = app.sites.filter(s => !s.listId);
  if (local.length){
    const same = app.batch && app.batch.name === data.name;
    const fs = el('fieldset', 'modes'); fs.appendChild(el('legend', null, `이 휴대폰에서 직접 등록한 시설물 ${local.length}곳이 있습니다`));
    [['merge', same ? '바뀐 내용만 반영 (사진·작성 내용 유지, 직접 고친 칸 보호)' : '기존 목록을 유지하고 추가·갱신'],
     ['replace', '전부 새로 등록 (직접 등록한 시설물·사진 삭제, 메일로 받은 목록은 유지)']].forEach(([v, t]) => {
      const l = el('label', 'check'); const r = document.createElement('input'); r.type = 'radio'; r.name = 'mode'; r.value = v; r.checked = v === mode;
      r.addEventListener('change', () => { mode = v; }); l.append(r, document.createTextNode(' ' + t)); fs.appendChild(l);
    });
    sh.appendChild(fs);
  }
  const acts = el('div', 'row');
  const bNo = btn('btn', '취소', () => { dlg.close(); });
  const bOk = btn('btn primary', '등록', async () => {
    if (mode === 'replace'){
      const pc = local.reduce((a, s) => a + photoCount(s), 0);
      if (!confirm(`직접 등록한 시설물 ${local.length}곳${pc ? `과 사진 ${pc}장` : ''}을 지우고 새로 등록할까요?`)) return;
      await wipeLocal();
    }
    const r = registerRows(data);
    dlg.close(); renderList();
    setMsg(r.added === data.rows.length && !r.updated ? `${data.rows.length}개 시설을 등록했습니다. 시설물을 눌러 보고서를 작성하세요.`
      : `반영했습니다: 갱신 ${r.updated}곳, 추가 ${r.added}곳${r.missing ? `, 목록에서 빠짐 ${r.missing}곳(사진 보호를 위해 지우지 않음)` : ''}.`);
  });
  acts.append(bNo, bOk); sh.appendChild(acts);
  dlg.oncancel = null; dlg.onclose = null;
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  if (!dlg.open) dlg.showModal();
}
function registerRows(data){
  const sameBatch = !!(app.batch && app.batch.name === data.name);
  const old = app.sites;
  const r = IMP.mergeSites(old, data.rows, {sameBatch:false, settings:app.settings, makeSite:newSite});
  app.sites = r.sites;
  // 빠진 시설물 표시는 이 휴대폰에서 직접 불러온 같은 회차에만 (메일로 받은 목록은 그 목록 파일이 관리)
  if (sameBatch) old.forEach(s => { if (s.src && !s.listId && s.slot == null && !r.matched.includes(s)){ s.removed = true; r.missing++; } });
  app.batch = {name:data.name || '대상 목록', importedAt:new Date().toISOString()};
  persistNow();
  return r;
}

/* ---------- 관리 화면 (#admin, 인터넷 PC에서 목록 파일 만들기 — 오프라인 admin.html 과 같은 코드) ---------- */
const adminMode = location.hash === '#admin';
function startAdmin(){
  ['#listView', '#editView', '#bar', '#backBtn', '#resetBtn', '#setBtn'].forEach(k => { $(k).hidden = true; });
  $('#adminView').hidden = false; $('#hdrSub').textContent = '대상목록 파일 만들기 (관리 화면)';
  window.SajinAdmin.start({ plainDownload, downloads: () => downloads, crypto: CRYPTO });
}

load();
})();
