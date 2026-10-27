// 브라우저 없이 생성기를 돌려 tests/out/sample.hwpx 를 만든다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
require('../src/hwpxgen.js');               // globalThis.SajinHwpx 등록
const { buildHwpx } = globalThis.SajinHwpx;

const T = JSON.parse(readFileSync(new URL('../template/tpl.json', import.meta.url), 'utf8'));
const B = readFileSync(new URL('../template/base.b64', import.meta.url), 'utf8').trim();
const img = n => readFileSync(new URL('./fixtures/' + n, import.meta.url));
const photoMap = {
  a: { bytes: img('landscape.jpg'), w: 1600, h: 1200 },
  b: { bytes: img('portrait.jpg'), w: 1200, h: 1600 },
  c: { bytes: img('landscape.jpg'), w: 1600, h: 1200 },
};
const state = {
  attach1: true,
  meta: {
    date: '2026. 11.', period: '2026. 11. 3.', purpose: '정밀안전점검·진단의 사실관계확인 & <특수문자>',
    inspectors: '총 3명(국토안전관리원 2명, 시설관리자 1명)', facility: '시험체육관', owner: '○○시청', location: '서울특별시',
    kind: '건축물', grade: '2종', completed: '2010.01.01', floors: '지상2층/지하1층', area: '1,000㎡', height: '15m',
    safety: "B ('25년 정밀점검)", resultHeading: '합동점검 결과', defaultLabel: '합동점검 사진'
  },
  sections: [
    { id: 1, title: '외관조사의 적정성', item: '외관조사 적정성 확인', opinion: '의견 첫째 줄\n의견 둘째 줄',
      photos: [{ id: 'a', label: '정밀안전점검 보고서 발췌', desc: '슬래브 균열' }, { id: 'b', desc: '세로 사진' }, { id: 'c' }] },
    { id: 2, title: '비파괴조사 적정성', item: '비파괴조사 적정성 확인', opinion: '', photos: [] },
    { id: 9, type: 'proposal', title: '보수・보강 및 유지관리 제안', opinion: '첫째 제안\n둘째 제안', photos: [{ id: 'a', desc: '조명' }] }
  ]
};
const buf = await buildHwpx(state, photoMap, JSZip, T, B, 'nodebuffer');
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/sample.hwpx', import.meta.url), buf);
console.log(`sample.hwpx 생성 (${(buf.length / 1048576).toFixed(2)} MB)`);
