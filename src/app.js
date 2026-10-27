(() => {
'use strict';
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const today = new Date();
const PARTS = ['슬래브','보','기둥','벽체','담장','관람석','계단','지붕(막구조)','옹벽','난간','부착물','바닥'];
const DAMAGE = ['균열','철근노출','박리·박락','누수·백태','기울음','파손','부식','체결불량','처짐'];
const LABELS = ['정밀안전점검 보고서 발췌','정밀안전점검 시의 외관조사 사진'];

const defaultState = () => ({
  v:2, crop:true, attach1:true, withPhotos:true,
  meta:{
    date:`${today.getFullYear()}. ${String(today.getMonth()+1).padStart(2,'0')}.`,
    purpose:'정밀안전점검·진단의 사실관계확인 및 시설물 유지관리요령 전파',
    period:`${today.getFullYear()}. ${today.getMonth()+1}. ${today.getDate()}.`,
    inspectors:'', facility:'', owner:'', location:'',
    kind:'', grade:'', completed:'', floors:'', area:'', height:'', safety:'',
    resultHeading:'합동점검 결과', defaultLabel:'합동점검 사진'
  },
  sections:[
    {id:uid(), title:'외관조사의 적정성', item:'외관조사 적정성 확인', opinion:'', photos:[]},
    {id:uid(), title:'비파괴조사 적정성', item:'비파괴조사 적정성 확인', opinion:'', photos:[]},
    {id:uid(), title:'유지관리 방안의 적정성', item:'유지관리 방안의 적정성 확인', opinion:'', photos:[]},
    {id:uid(), title:'시설물 안전 및 유지관리에 관한 특이사항', item:'기타 시설물 안전 및 유지관리에 관한 특이사항 확인', opinion:'', photos:[]},
    {id:uid(), type:'proposal', title:'보수・보강 및 유지관리 제안', opinion:'외관조사망도에 제시된 손상을 참고하여 지속적인 관리가 필요함', photos:[]}
  ]
});

let state = defaultState();
const blobs = new Map();   // photoId -> Blob
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
function persist(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => tx('kv','readwrite', s => s.put(JSON.stringify(state),'draft')), 400); }
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
let lostOnLoad = 0;
const delPhoto = id => tx('photos','readwrite', s => s.delete(id));

async function load(){
  try{
    const db = await idb();
    const raw = await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('draft'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    if (raw){
      const st = JSON.parse(raw);
      if (st && st.sections){
        state = st;
        const ids = st.sections.flatMap(s => s.photos.map(p => p.id));
        await Promise.all(ids.map(id => new Promise(res => {
          const r = db.transaction('photos').objectStore('photos').get(id);
          r.onsuccess = async () => { const b = await toFreshBlob(r.result); if (b){ blobs.set(id, b); urls.set(id, URL.createObjectURL(b)); if (!r.result.buf) putPhoto(id, b); } else { lostOnLoad++; delPhoto(id); } res(); };
          r.onerror = () => res();
        })));
        state.sections.forEach(s => s.photos = s.photos.filter(p => blobs.has(p.id)));
        persist();
      }
    }
  }catch(e){}
  render();
  if (lostOnLoad) setMsg(`이전에 넣은 사진 ${lostOnLoad}장을 불러오지 못해 목록에서 뺐습니다. 해당 사진만 다시 추가해 주세요.`, true);
}

/* ---------- 이미지 처리 ---------- */
async function processImage(file){
  let src, w, h;
  try{ src = await createImageBitmap(file, {imageOrientation:'from-image'}); w = src.width; h = src.height; }
  catch(e){
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  let sx = 0, sy = 0, sw = w, sh = h;
  if (state.crop){
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
  META_FIELDS.forEach(([k, label, full]) => {
    const l = document.createElement('label'); l.className = 'f' + (full ? ' full' : '');
    l.textContent = label;
    const i = document.createElement('input'); i.type = 'text'; i.value = state.meta[k] || '';
    i.addEventListener('input', () => { state.meta[k] = i.value; if (k === 'facility' || k === 'defaultLabel') { updateHeader(); if (k==='defaultLabel') renderSections(); } persist(); });
    l.appendChild(i); f.appendChild(l);
  });
  const c = document.createElement('label'); c.className = 'check full';
  c.innerHTML = '<input type="checkbox"> 사진을 4:3 비율로 맞춰 자르기 (보고서 칸 크기 통일)';
  const cb = c.querySelector('input'); cb.checked = !!state.crop;
  cb.addEventListener('change', () => { state.crop = cb.checked; persist(); });
  f.appendChild(c);
  [['attach1','제안에 「시설물안전법 실시시기(붙임1)」 문구 넣기'],['withPhotos','보고서와 함께 사진 원본 파일도 보내기']].forEach(([k,t]) => {
    const l = document.createElement('label'); l.className = 'check full';
    l.innerHTML = '<input type="checkbox"> '; l.appendChild(document.createTextNode(t));
    const x = l.querySelector('input'); x.checked = state[k] !== false;
    x.addEventListener('change', () => { state[k] = x.checked; persist(); });
    f.appendChild(l);
  });
}
function updateHeader(){
  $('#hdrSub').textContent = state.meta.facility ? state.meta.facility : '새 보고서';
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
function setMsg(t, err){ const m = $('#msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }
const TPL = JSON.parse(document.getElementById('hwpxTpl').textContent);
const BASE = document.getElementById('hwpxBase').textContent.trim();
let downloads = null;
(async () => {
  try{ if (window.claude && window.claude.use) downloads = await window.claude.use('downloads'); }catch(e){ downloads = null; }
  if (!downloads && window.claude) setMsg('현재 화면(로그인 안 됨 또는 다른 앱 안의 브라우저)에서는 저장·메일 보내기가 막힐 수 있습니다. Claude 앱에 로그인한 뒤 이 링크를 열어 주세요.', true);
})();
const clean = t => String(t || '').replace(/[\\/:*?"<>|\n\r]/g,'').trim();
function yymmdd(){ const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0'); }
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
  const blob = await SajinHwpx.buildHwpx(state, photoMap, JSZip, TPL, BASE, 'blob');
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
    const photos = state.withPhotos !== false ? photoFiles() : [];
    if (downloads){
      // Claude 화면에서는 .hwpx를 바로 저장할 수 없어 압축파일(.zip)로 저장
      const z = new JSZip(); z.file(report.name, report);
      photos.forEach(f => z.file('사진/' + f.name, f));
      const zb = await z.generateAsync({type:'blob', compression:'STORE'});
      const name = baseName() + '.zip';
      await downloads.save({filename:name, data:zb});
      setMsg(`저장했습니다: ${name}. 압축을 풀면 한글 파일(.hwpx)${photos.length ? '과 사진 폴더' : ''}가 들어 있습니다.`);
    } else {
      const bundle = await makeBundle(report, photos);
      plainDownload(bundle);
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
  return [report, ...(state.withPhotos !== false ? photoFiles() : [])];
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
      await shareNow(prepared.files);
      setMsg('메일 앱을 고르면 보고서와 사진이 첨부됩니다.');
      return;
    }
    btn.disabled = true; btn.textContent = '파일 만드는 중…';
    prepared = {ver: editVer, files: await prepareFiles()};
    btn.disabled = false; btn.textContent = '메일로 보내기';
    try{
      await shareNow(prepared.files);
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
        plainDownload(await makeBundle(files[0], files.slice(1)));
        setMsg(`이 브라우저는 공유창을 지원하지 않아 파일을 내려받았습니다. ${WHERE}에서 확인 후 메일에 첨부하세요. 사파리·크롬으로 열면 바로 메일 보내기가 됩니다.`, true);
      }
      return;
    }
    setMsg((e && e.message) || '보내기를 준비하지 못했습니다.', true);
  }
});
// 네이버·카카오톡 등 앱 안의 브라우저 안내
if (/NAVER|KAKAOTALK|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(navigator.userAgent)){
  setMsg('지금은 다른 앱 안의 브라우저입니다. 메뉴(⋯)에서 ‘다른 브라우저로 열기’(사파리·크롬)를 누르면 메일 보내기가 됩니다.', true);
}

$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('입력 내용과 사진을 모두 지우고 새 보고서를 시작할까요?')) return;
  state.sections.forEach(s => s.photos.forEach(p => dropPhoto(p.id)));
  await tx('photos','readwrite', s => s.clear());
  state = defaultState(); persist(); render(); setMsg('새 보고서를 시작했습니다.');
  $('#metaBox').open = true;
});

load();
})();
