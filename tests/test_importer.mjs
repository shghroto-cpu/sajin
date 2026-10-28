// 대상목록 엑셀 읽기·변환·공유 링크 단위 테스트 (가짜 엑셀 tests/fixtures/sample_list*.xlsx 사용)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
require('../src/xlsxreader.js');            // globalThis.SajinXlsx 등록
require('../src/importer.js');              // globalThis.SajinImport 등록
const { readXlsx } = globalThis.SajinXlsx;
const I = globalThis.SajinImport;

const fx = n => readFileSync(new URL('./fixtures/' + n, import.meta.url));
const settings = { kindMode: 'excel' };

for (const file of ['sample_list.xlsx', 'sample_list_alias.xlsx']) {
  const { sheets } = await readXlsx(fx(file), JSZip);
  const r = I.parseWorkbook(sheets);
  assert.equal(r.name, '99년 9차 사실관계조사 시설물', file + ' 시트 이름');
  assert.equal(r.rows.length, 7, file + ' 시설 7건 (계산식·빈 행·비고 줄 무시)');
  assert.deepEqual(r.rows.map(x => x.no), [1, 2, 3, 4, 5, 6, 7], '연번 순서');
  assert.ok(r.rows.every(x => !('P' in x)), '머리글 밖 열 무시');
  const [a, b, c, , e, f, g] = r.rows;
  const m = I.metaFromRow(a, settings);
  assert.equal(m.facility, '가나아파트');
  assert.equal(m.owner, '가나아파트 관리사무소');
  assert.equal(m.location, '가상도 가상시 가상구 가상동 1');
  assert.equal(m.kind, '공동주택');
  assert.equal(m.grade, '2종');
  assert.equal(m.completed, '2001.01.01', '준공일 - → .');
  assert.equal(m.safety, 'B (정밀점검)');
  assert.equal(m.inspectors, '총 2명(국토안전관리원 2명)');
  assert.equal(m.period, '2026. 11. 2.');
  assert.equal(m.date, '2026. 11.');
  assert.equal(a.wd, '월'); assert.equal(a.buildings, '6'); assert.equal(a.phone, '000-0000-0001'); assert.equal(a.contact, '');
  // 엑셀 날짜 숫자
  const mb = I.metaFromRow(b, settings);
  assert.equal(mb.period, '2026. 11. 2.', '날짜 숫자 → 2026. 11. 2.');
  assert.equal(mb.completed, '2002.02.02');
  assert.equal(b.dateLabel, '2026-11-02 (월)');
  assert.equal(b.phone, '', '빈 연락처'); assert.equal(b.contact, '시험담당');
  // 오전/오후, 정밀안전진단, 3명
  assert.equal(c.ampm, '오전'); assert.equal(c.dateKey, '2026-11-03'); assert.equal(c.wd, '화');
  assert.equal(I.metaFromRow(c, settings).safety, 'D (정밀진단)');
  assert.equal(I.metaFromRow(c, settings).inspectors, '총 3명(국토안전관리원 3명)');
  assert.equal(I.metaFromRow(c, settings).completed, '2003.03.03');
  assert.equal(I.metaFromRow(c, settings, 2).inspectors, '총 5명(국토안전관리원 3명, 시설관리자 2명)');
  assert.equal(e.completed, '준공일 미상'); assert.equal(e.ampm, '오후');
  assert.ok(r.warnings.some(w => w.startsWith('5번 자차아파트: 준공일')), '읽지 못한 준공일 경고');
  assert.equal(f.travelers.length, 1); assert.equal(f.dateKey, '2026-11-04');
  assert.equal(g.dateKey, '2026-11-04'); assert.equal(g.wd, '수');
  assert.equal(I.metaFromRow(a, { kindMode: 'fixed' }).kind, '건축물', '종류 고정 설정');
  assert.equal(I.metaFromRow(Object.assign({}, a, { year: '2025' }), settings).safety, 'B (’25년 정밀점검)');
  // 날짜 묶음
  const groups = I.groupByDate(r.rows, '2026-11-03');
  assert.deepEqual(groups.map(x => x.label), ['11.3 (화)', '11.2 (월)', '11.4 (수)'], '오늘 먼저, 나머지 날짜순');
  assert.deepEqual(groups.map(x => x.sites.length), [3, 2, 2]);

  // 공유 링크: 왕복 복원, 연락처 기본 제외
  const full = I.packList(r.name, r.rows, { withContact: true });
  const back = await I.decodeShare(await I.encodeShare(full, JSZip), JSZip);
  assert.equal(back.name, r.name);
  assert.deepEqual(back.rows, r.rows.map(x => Object.assign({}, x, { travelerCount: 0 })), '공유 링크 왕복');
  const code = await I.encodeShare(I.packList(r.name, r.rows), JSZip);
  const noC = await I.decodeShare(code, JSZip);
  assert.ok(noC.rows.every(x => !x.phone && !x.contact), '연락처 포함 해제 시 연락처 빠짐');
  assert.ok(!/[?&#+/=]/.test(code), '링크 문자 안전 (base64url)');
  const noT = await I.decodeShare(await I.encodeShare(I.packList(r.name, r.rows, { withTravelers: false }), JSZip), JSZip);
  assert.ok(noT.rows.every(x => !x.travelers.length), '출장자 이름 제외');
  assert.equal(I.metaFromRow(noT.rows[2], settings).inspectors, '총 3명(국토안전관리원 3명)', '이름을 빼도 인원은 유지');
  await assert.rejects(I.decodeShare(code.slice(0, 40), JSZip), /잘렸거나/);

  // 다시 불러오기: 직접 고친 값 보호, 빠진 시설 표시
  const mk = row => I.applyRow({ id: 'x' + row.no, edited: [], meta: {}, sections: [] }, row, settings);
  const sites = r.rows.slice(0, 6).map(mk);
  sites[0].meta.owner = '현장에서 고친 관리주체'; sites[0].edited.push('owner');
  const rows2 = r.rows.filter(x => x.no !== 2).map(x => Object.assign({}, x, { location: x.location + ' (수정)' }));
  const mr = I.mergeSites(sites, rows2, { sameBatch: true, settings, makeSite: mk });
  assert.equal(mr.updated, 5); assert.equal(mr.added, 1); assert.equal(mr.missing, 1);
  assert.equal(sites[0].meta.owner, '현장에서 고친 관리주체', '직접 고친 값은 유지');
  assert.ok(sites[0].meta.location.endsWith('(수정)'), '엑셀 값 갱신');
  assert.equal(sites[1].removed, true, '빠진 시설물은 지우지 않고 표시');
}
await assert.rejects(async () => I.parseWorkbook([{ name: 'x', rows: [['a', 'b'], ['c']] }]), /시설물명 열을 찾지 못했습니다/);
// 첫 시트에 머리글이 없으면 다음 시트를 찾음
const { sheets } = await readXlsx(fx('sample_list.xlsx'), JSZip);
assert.equal(I.parseWorkbook([{ name: '표지', rows: [['제목']] }, ...sheets]).rows.length, 7, '다음 시트 찾기');
console.log('대상목록 테스트 통과: 가짜 엑셀 2개, 시설 7건, 공유 링크·다시 불러오기');
