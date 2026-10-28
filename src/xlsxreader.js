/* 엑셀(.xlsx) 읽기: JSZip으로 열어 시트의 칸 값을 꺼낸다. 브라우저·Node 공용 (DOMParser 사용 안 함) */
(function (root) {
  const unxml = s => String(s)
    .replace(/&#x([0-9a-f]+);/gi, (a, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (a, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/_x([0-9A-F]{4})_/g, (a, h) => String.fromCharCode(parseInt(h, 16)));
  const attr = (s, n) => { const m = new RegExp('\\b' + n + '="([^"]*)"').exec(s); return m ? unxml(m[1]) : null; };
  // <t> 들을 이어 붙임 (윗주 <rPh>는 뺌)
  const texts = s => { let o = ''; s.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (a, t) => { o += t; }); return unxml(o); };
  const colNo = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function readXlsx(data, JSZip) {
    let zip;
    try { zip = await JSZip.loadAsync(data); } catch (e) { throw new Error('엑셀 파일(.xlsx)을 열 수 없습니다. 파일이 손상되었거나 다른 형식입니다.'); }
    const rd = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
    const wb = await rd('xl/workbook.xml');
    if (!wb) throw new Error('엑셀 파일(.xlsx)이 아닙니다. 한셀·엑셀에서 .xlsx로 다시 저장해 주세요.');
    const rels = (await rd('xl/_rels/workbook.xml.rels')) || '';
    const relMap = {};
    rels.replace(/<Relationship\b[^>]*>/g, r => { relMap[attr(r, 'Id')] = attr(r, 'Target'); });
    const ss = [];
    const sst = await rd('xl/sharedStrings.xml');
    if (sst) sst.replace(/<si>([\s\S]*?)<\/si>|<si\/>/g, (a, b) => { ss.push(b ? texts(b) : ''); });
    const sheets = [];
    const list = [];
    wb.replace(/<sheet\b[^>]*>/g, s => { list.push({ name: attr(s, 'name'), rid: attr(s, 'r:id') }); });
    for (let i = 0; i < list.length; i++) {
      let target = relMap[list[i].rid] || `worksheets/sheet${i + 1}.xml`;
      target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const xml = await rd('xl/' + target);
      if (!xml) continue;
      const rows = [];
      xml.replace(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (a, ra, body) => {
        const r = (+attr(ra, 'r') || rows.length + 1) - 1;
        const cells = [];
        let next = 0;
        (body || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (b, ca, cb) => {
          const ref = attr(ca, 'r'); const c = ref ? colNo(ref) : next; next = c + 1;
          const t = attr(ca, 't'); cb = cb || '';
          const v = /<v>([\s\S]*?)<\/v>/.exec(cb);   // 계산식(<f>)은 무시하고 결과값(<v>) 사용
          let val = null;
          if (t === 's') val = v ? (ss[+v[1]] != null ? ss[+v[1]] : '') : null;
          else if (t === 'inlineStr') val = texts(cb);
          else if (t === 'str' || t === 'e' || t === 'd') val = v ? unxml(v[1]) : null;
          else if (t === 'b') val = v ? v[1] === '1' : null;
          else if (v) { const n = Number(v[1]); val = isNaN(n) ? unxml(v[1]) : n; }
          if (val !== null && val !== '') cells[c] = val;
        });
        rows[r] = cells;
      });
      for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
      sheets.push({ name: list[i].name || `시트${i + 1}`, rows });
    }
    return { sheets };
  }
  root.SajinXlsx = { readXlsx };
  if (typeof module !== 'undefined') module.exports = { readXlsx };
})(typeof window !== 'undefined' ? window : globalThis);
