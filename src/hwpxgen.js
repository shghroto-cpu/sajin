/* 관리주체 합동점검 결과보고서 HWPX 생성기 (원본 한글 양식 기반) */
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fill = (t, m) => t.replace(/\{\{(\w+)\}\}/g, (a, k) => (k in m ? m[k] : a));
  const lines = t => String(t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => s.replace(/^[-ㅇ○•·]\s*/, ''));
  async function buildHwpx(state, photoMap, JSZip, T, baseB64, outType) {
    const m = state.meta || {};
    // 사진 칸 크기(HWPUNIT): 원본 양식의 사진 크기에서 가져옴, 4:3 상자
    const BOX_W = (T.picBox && T.picBox[0]) || 22372, BOX_H = Math.round(BOX_W * 3 / 4);
    const BF_PHOTO = T.photoBorder || '7', BF_GAP = T.gapBorder || '8';
    let uid = 1900000000 + Math.floor(Math.random() * 90000000), z = 300;
    const newId = () => ++uid;
    const media = [];
    const out = [];
    const P = (key, map) => out.push(fill(T[key], map || {}));

    out.push(T.secOpen);
    out.push(fill(T.head, { DATE: esc(m.date) }));
    P('purpose', { T: esc(m.purpose) });
    P('period', { T: esc(m.period) });
    const ins = String(m.inspectors || ''); const k = ins.indexOf('(');
    P('inspectors', { A: esc(k < 0 ? ins : ins.slice(0, k)), B: esc(k < 0 ? '' : ins.slice(k)) });
    out.push(T.h_facility);
    P('facility', { T: esc(m.facility) });
    P('owner', { T: esc(m.owner) });
    P('location', { T: esc(m.location) });
    if ([m.kind, m.grade, m.completed, m.floors, m.area, m.height, m.safety].some(Boolean)) {
      out.push(T.detail);
      const sf = String(m.safety || ''); const j = sf.indexOf('(');
      P('ftable', { K0: esc(m.kind), K1: esc(m.grade), K2: esc(m.completed), K3: esc(m.floors), K4: esc(m.area), K5: esc(m.height),
        K6: esc(j < 0 ? sf : sf.slice(0, j).trimEnd() + ' '), K7: esc(j < 0 ? '' : sf.slice(j)) });
    }
    const results = state.sections.filter(s => s.type !== 'proposal');
    const proposal = state.sections.find(s => s.type === 'proposal');
    const items = results.filter(s => !s.isOverview).map(s => s.item || (s.title + ' 확인'));
    if (items.length) { out.push(T.h_items); items.forEach(t => P('item', { T: esc(t) })); }

    const defLabel = m.defaultLabel || '합동점검 사진';
    function picXml(p) {
      const n = media.length + 1;
      const bin = 'image' + (100 + n);
      media.push({ id: bin, name: `BinData/${bin}.jpg`, bytes: p.bytes });
      let cw = BOX_W, ch = Math.round(BOX_W * p.h / p.w);
      if (ch > BOX_H) { ch = BOX_H; cw = Math.round(BOX_H * p.w / p.h); }
      const ow = p.w * 100, oh = p.h * 100;
      return fill(T.pic, {
        PID: newId(), PZ: ++z, INST: newId(), OW: ow, OH: oh, CW: cw, CH: ch,
        CX: Math.floor(cw / 2), CY: Math.floor(ch / 2),
        SX: (cw / ow).toFixed(6), SY: (ch / oh).toFixed(6), BIN: bin,
        DW: p.w * 75, DH: p.h * 75, NAME: esc((p.desc || 'photo') + '.jpg')
      });
    }
    function caption(p) {
      let s = fill(T.capTitle, { T: esc(p.label || defLabel) });
      if (p.desc) s += fill(T.capDesc, { T: esc('(' + p.desc + ')') });
      return s;
    }
    function photoTables(ps) {
      for (let i = 0; i < ps.length; i += 2) {
        const a = ps[i], b = ps[i + 1];
        const h1 = Math.max(...[a, b].filter(Boolean).map(p => { const r = Math.round(BOX_W * p.h / p.w); return Math.min(r, BOX_H); }));
        const t = fill(T.photoTbl, {
          TID: newId(), TZ: ++z,
          PIC1: picXml(a), PIC2: b ? picXml(b) : '',
          CAP1: caption(a), CAP2: b ? caption(b) : T.capEmpty,
          BF1: BF_PHOTO, BF2: b ? BF_PHOTO : BF_GAP,
          RH: h1 + 282, TH: h1 + 282 + 2898
        });
        out.push(t);
      }
    }
    const photosOf = s => (s.photos || []).map(p => Object.assign({}, p, photoMap[p.id])).filter(p => p.bytes);

    P('h_result', { T: esc(m.resultHeading || '합동점검 결과') });
    results.forEach(s => {
      P('secTitle', { T: esc(s.title) });
      lines(s.opinion).forEach(l => P('opinion', { T: esc(l) }));
      photoTables(photosOf(s));
    });
    if (proposal) {
      out.push(T.h_prop);
      const pl = lines(proposal.opinion);
      pl.forEach((l, i) => {
        P('prop', { T: esc(l) });
        if (i === 0 && state.attach1 !== false) out.push(T.prop_att1);
      });
      if (!pl.length && state.attach1 !== false) out.push(T.prop_att1);
      photoTables(photosOf(proposal));
    }
    out.push(T.tail);
    const section = out.join('').replace(/<hp:linesegarray><\/hp:linesegarray>/g, '');

    const base = await JSZip.loadAsync(baseB64, { base64: true });
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    const names = Object.keys(base.files).filter(n => !base.files[n].dir);
    for (const n of names) zip.file(n, await base.file(n).async('uint8array'), { createFolders: false });
    zip.file('Contents/section0.xml', section, { createFolders: false });
    const items2 = T.fixedItems + media.map(mm => `<opf:item id="${mm.id}" href="${mm.name}" media-type="image/jpg" isEmbeded="1"/>`).join('');
    zip.file('Contents/content.hpf', fill(T.hpf, { ITEMS: items2, TITLE: esc(m.title || '관리주체 합동점검 결과 보고서') }), { createFolders: false });
    zip.file('Preview/PrvText.txt', [m.title, m.date, m.facility].filter(Boolean).join('\r\n'), { createFolders: false });
    media.forEach(mm => zip.file(mm.name, mm.bytes, { compression: 'STORE', createFolders: false }));
    return zip.generateAsync({ type: outType || 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
  }
  root.SajinHwpx = { buildHwpx };
  if (typeof module !== 'undefined') module.exports = { buildHwpx };
})(typeof window !== 'undefined' ? window : globalThis);
