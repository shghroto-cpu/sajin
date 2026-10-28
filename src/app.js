(() => {
'use strict';
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
  try{
    const db = await idb();
    const raw = await getKV(db, 'appState');
    if (raw){
      const st = JSON.parse(raw);
      if (st && Array.isArray(st.sites)) app = Object.assign(defaultApp(), st, {settings:Object.assign(defaultApp().settings, st.settings)});
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
  const open = app.sites.find(s => s.id === app.activeId);
  if (open) await openSite(open.id); else showList();
  checkHash();
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
  $('#backBtn').hidden = list; $('#resetBtn').hidden = list;
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
      setMsg(photos.length
        ? `내려받았습니다: ${bundle.name} → ${WHERE}. 한글 보고서와 사진 폴더가 함께 들어 있고, 이 압축파일을 그대로 메일에 첨부하면 됩니다.`
        : `내려받았습니다: ${bundle.name} → ${WHERE}에 있습니다.`);
    }
  }catch(e){
    const code = e && e.code;
    if (code === 'declined') setMsg('저장을 취소했습니다.');
    else if (code === 'rate_limited') setMsg('저장 창이 이미 열려 있습니다. 잠시 후 다시 누르세요.', true);
    else if (code === 'too_large') setMsg('파일이 너무 큽니다. "사진 원본 파일도 함께" 옵션을 끄고 다시 저장하세요.', true);
    else setMsg((e && e.message) || '파일을 만들지 못했습니다. 다시 시도하세요.', true);
  }
}));
// ---- 메일로 보내기: 휴대폰 공유창(메일·카카오톡 등)으로 한글 파일+사진 첨부 ----
let editVer = 0, prepared = null;
['input','change','click'].forEach(ev => document.getElementById('sections').addEventListener(ev, () => { editVer++; }, true));
document.getElementById('metaForm').addEventListener('input', () => { editVer++; }, true);
const WHERE = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '‘파일’ 앱 › 다운로드 폴더' : '‘내 파일’ › 다운로드 폴더';
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
      setMsg('메일 앱을 고르면 보고서와 사진이 첨부됩니다.');
      return;
    }
    btn.disabled = true; btn.textContent = '파일 만드는 중…';
    prepared = {ver: editVer, files: await prepareFiles()};
    btn.disabled = false; btn.textContent = '메일로 보내기';
    try{
      await shareNow(prepared.files); markSaved();
      setMsg('메일 앱을 고르면 보고서와 사진이 첨부됩니다.');
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
    btn.disabled = false; if (!prepared || prepared.ver !== editVer) btn.textContent = '메일로 보내기';
    if (e && e.name === 'AbortError') { setMsg('보내기를 취소했습니다.'); return; }
    if (e && (e.code === 'noshare' || e.name === 'NotAllowedError' || e.name === 'TypeError')){
      if (downloads){ setMsg('저장 창을 엽니다. 창에서 ‘메일’을 고르거나, 저장 후 메일 앱에서 첨부하세요.'); setTimeout(() => $('#saveBtn').click(), 0); }
      else if (window.claude){ setMsg('이 화면에서는 메일·저장이 막혀 있습니다. 배포용 주소(사파리·크롬)로 열어 주세요.', true); }
      else {
        // 공유창을 지원하지 않는 브라우저: 파일을 내려받고 위치 안내
        const files = (prepared && prepared.files) || await prepareFiles();
        plainDownload(await makeBundle(files[0], files.slice(1))); markSaved();
        setMsg(`이 브라우저는 공유창을 지원하지 않아 파일을 내려받았습니다. ${WHERE}에서 확인 후 메일에 첨부하세요. 사파리·크롬으로 열면 바로 메일 보내기가 됩니다.`, true);
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

function markSaved(){ if (state){ state.savedAt = new Date().toISOString(); persist(); } }

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
const localKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function renderList(){
  const n = app.sites.length;
  $('#hdrSub').textContent = app.batch ? app.batch.name : '대상 목록';
  $('#batchName').textContent = app.batch ? app.batch.name : (n ? '작성 중인 보고서' : '대상 목록');
  $('#batchCount').textContent = n ? `· ${n}개 시설` : '';
  $('#shareListBtn').hidden = !app.sites.some(s => s.src);
  $('#clearListBtn').hidden = !n;
  const box = $('#siteList'); box.innerHTML = '';
  if (!n){
    const e = el('div', 'block empty');
    e.append(el('b', null, '등록된 시설물이 없습니다'),
      el('p', null, '출장 전에 사실관계조사 대상목록 엑셀을 불러오면 시설물마다 기본정보가 채워진 보고서가 만들어집니다. 엑셀 없이 쓰려면 「직접 입력해서 시작」을 누르세요.'));
    box.appendChild(e); return;
  }
  IMP.groupByDate(app.sites, localKey(new Date())).forEach(g => {
    const h = el('h2', 'day', g.label); h.appendChild(el('span', null, ` ${g.sites.length}곳`));
    if (g.today) h.appendChild(el('em', 'today', '오늘'));
    box.appendChild(h);
    g.sites.forEach(s => box.appendChild(siteCard(s)));
  });
}
function siteCard(s){
  const m = s.meta, card = el('article', 'block site' + (s.removed ? ' removed' : ''));
  const open = el('button', 'site-open'); open.type = 'button';
  const l1 = el('div', 'st1');
  l1.append(el('span', 'no', s.no || '·'), el('b', 'nm', m.facility || '(시설물명 없음)'));
  const sg = s.src ? s.src.safetyGrade : '';
  const tags = el('span', 'tags');
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
  if (s.removed || !s.src){
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
async function wipeAll(){
  await tx('photos','readwrite', s => s.clear());
  app.sites = []; app.batch = null; app.activeId = null;
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

/* ---------- 엑셀·목록 파일·공유 링크로 등록 ---------- */
$('#xlsBtn').addEventListener('click', () => { const fi = $('#xlsIn'); fi.value = ''; fi.click(); });
$('#xlsIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try{
    if (!window.JSZip) throw new Error('엑셀을 여는 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.');
    if (!/\.xlsx$/i.test(f.name)) throw new Error('.xlsx 파일만 불러올 수 있습니다. 엑셀에서 「다른 이름으로 저장 › Excel 통합 문서(.xlsx)」로 저장해 주세요.');
    const {sheets} = await SajinXlsx.readXlsx(await f.arrayBuffer(), JSZip);
    showPreview(IMP.parseWorkbook(sheets), '엑셀');
  }catch(err){ setMsg(err.message || '엑셀을 읽지 못했습니다.', true); }
});
$('#jsonBtn').addEventListener('click', () => { const fi = $('#jsonIn'); fi.value = ''; fi.click(); });
$('#jsonIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try{
    let o; try{ o = JSON.parse(await f.text()); }catch(x){ throw new Error('목록 파일(.json)이 아니거나 손상되었습니다.'); }
    showPreview(Object.assign(IMP.unpackList(o), {warnings:[]}), '목록 파일');
  }catch(err){ setMsg(err.message, true); }
});
function clearHash(){ if (/^#list=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
async function checkHash(){
  const m = /^#list=(.+)$/.exec(location.hash); if (!m) return;
  if (!listShown) showList();
  if (!window.JSZip){ setMsg('목록을 여는 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.', true); return; }
  try{ showPreview(Object.assign(await IMP.decodeShare(m[1], JSZip), {warnings:[]}), '공유 링크'); }
  catch(err){ clearHash(); setMsg(err.message, true); }
}
window.addEventListener('hashchange', checkHash);

function showPreview(data, from){
  const sh = $('#sheet'); sh.innerHTML = '';
  sh.appendChild(el('h3', 'ptitle', `${data.name || '대상 목록'} · ${data.rows.length}개 시설`));
  sh.appendChild(el('p', 'sub', `${from}에서 읽은 목록입니다. 내용을 확인하고 「등록」을 누르세요.`));
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
  if (app.sites.length){
    const same = app.batch && app.batch.name === data.name;
    const fs = el('fieldset', 'modes'); fs.appendChild(el('legend', null, `이미 등록된 시설물 ${app.sites.length}곳이 있습니다`));
    [['merge', same ? '바뀐 내용만 반영 (사진·작성 내용 유지, 직접 고친 칸 보호)' : '기존 목록을 유지하고 추가·갱신'],
     ['replace', '전부 새로 등록 (기존 시설물·사진 삭제)']].forEach(([v, t]) => {
      const l = el('label', 'check'); const r = document.createElement('input'); r.type = 'radio'; r.name = 'mode'; r.value = v; r.checked = v === mode;
      r.addEventListener('change', () => { mode = v; }); l.append(r, document.createTextNode(' ' + t)); fs.appendChild(l);
    });
    sh.appendChild(fs);
  }
  const acts = el('div', 'row');
  const bNo = btn('btn', '취소', () => { dlg.close(); });
  const bOk = btn('btn primary', '등록', async () => {
    if (mode === 'replace'){
      const pc = app.sites.reduce((a, s) => a + photoCount(s), 0);
      if (!confirm(`기존 시설물 ${app.sites.length}곳${pc ? `과 사진 ${pc}장` : ''}을 지우고 새로 등록할까요?`)) return;
      await wipeAll();
    }
    const r = registerRows(data);
    dlg.close(); renderList();
    setMsg(r.added === data.rows.length && !r.updated ? `${data.rows.length}개 시설을 등록했습니다. 시설물을 눌러 보고서를 작성하세요.`
      : `반영했습니다: 갱신 ${r.updated}곳, 추가 ${r.added}곳${r.missing ? `, 목록에서 빠짐 ${r.missing}곳(사진 보호를 위해 지우지 않음)` : ''}.`);
  });
  acts.append(bNo, bOk); sh.appendChild(acts);
  dlg.oncancel = null; dlg.onclose = () => { dlg.onclose = null; clearHash(); };
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  if (!dlg.open) dlg.showModal();
}
function registerRows(data){
  const sameBatch = !!(app.batch && app.batch.name === data.name);
  const r = IMP.mergeSites(app.sites, data.rows, {sameBatch, settings:app.settings, makeSite:newSite});
  app.sites = r.sites;
  app.batch = {name:data.name || '대상 목록', importedAt:new Date().toISOString()};
  persistNow();
  return r;
}

/* ---------- 목록 공유: 링크(# 뒤, 서버로 전송되지 않음) 또는 목록 파일 ---------- */
const LINK_MAX = 6000;
$('#shareListBtn').addEventListener('click', () => {
  const rows = app.sites.filter(s => s.src && !s.removed).map(s => s.src);
  const name = app.batch ? app.batch.name : '대상 목록';
  const sh = $('#sheet'); sh.innerHTML = '';
  sh.appendChild(el('h3', 'ptitle', `목록 공유 · ${rows.length}개 시설`));
  sh.appendChild(el('p', 'sub', '함께 가는 실원에게 보내면 같은 목록이 등록됩니다. 엑셀에서 온 정보만 들어가고 사진·작성 내용은 들어가지 않습니다. 링크의 정보는 주소의 # 뒤에 있어 서버로 전송되지 않습니다.'));
  const opt = {withTravelers:true, withContact:false};
  [['withTravelers', '출장자 이름 포함 (빼도 인원 수는 유지)'], ['withContact', '연락처·담당자 포함']].forEach(([k, t]) => {
    const l = el('label', 'check'); const x = document.createElement('input'); x.type = 'checkbox'; x.checked = opt[k];
    x.addEventListener('change', () => { opt[k] = x.checked; make(); }); l.append(x, document.createTextNode(' ' + t)); sh.appendChild(l);
  });
  const ta = document.createElement('textarea'); ta.readOnly = true; ta.rows = 3; ta.className = 'linkbox'; ta.setAttribute('aria-label', '공유 링크');
  const info = el('p', 'sub');
  const r1 = el('div', 'row');
  // 복사·공유는 터치 직후에 바로 실행되어야 하므로 링크를 미리 만들어 둠
  const bCopy = btn('btn primary', '링크 복사', async () => {
    try{ await navigator.clipboard.writeText(link); info.textContent = '복사했습니다. 메신저에 붙여 넣어 보내세요.'; }
    catch(e){ ta.focus(); ta.select(); info.textContent = '위 링크를 길게 눌러 복사하세요.'; }
  });
  const bSend = btn('btn', '링크 보내기', async () => {
    try{ await navigator.share({title:name, text:name + ' 대상 목록', url:link}); }catch(e){}
  });
  bSend.hidden = !navigator.share;
  r1.append(bCopy, bSend);
  const bFile = btn('btn', '목록 파일로 저장 (.json)', async () => {
    const m = /(\d+)\s*년\s*(\d+)\s*차/.exec(name);
    const fname = `대상목록_${m ? `${m[1]}년${m[2]}차` : (clean(name).replace(/\s+/g, '').slice(0, 20) || '목록')}.json`;
    const file = new File([JSON.stringify(IMP.packList(name, rows, opt))], fname, {type:'application/json'});
    try{
      if (downloads) await downloads.save({filename:fname, data:file}); else plainDownload(file);
      info.textContent = `저장했습니다: ${fname} → 메일·메신저로 보내면 받는 사람이 「목록 파일 불러오기」로 등록합니다.`;
    }catch(e){ info.textContent = '저장하지 못했습니다.'; }
  });
  const bClose = btn('btn', '닫기', () => dlg.close());
  sh.append(ta, r1, info, bFile, bClose);
  let link = '';
  async function make(){
    const code = await IMP.encodeShare(IMP.packList(name, rows, opt), JSZip);
    link = location.href.split('#')[0] + '#list=' + code;
    const tooLong = link.length > LINK_MAX;
    ta.value = tooLong ? '' : link; bCopy.disabled = bSend.disabled = tooLong;
    info.textContent = tooLong ? `목록이 커서 링크가 너무 깁니다(${link.length.toLocaleString()}자). 아래 「목록 파일로 저장」으로 공유하세요.` : `링크 길이 ${link.length.toLocaleString()}자`;
  }
  dlg.oncancel = null; dlg.onclose = null;
  dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
  if (!dlg.open) dlg.showModal();
  if (window.JSZip) make(); else info.textContent = '도구를 불러오지 못했습니다. 새로고침하세요.';
});

load();
})();
