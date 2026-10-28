// QR 테스트용 가짜 대상목록 행 (무작위 글자, 실제 시설 정보 아님)
// 시설물명·주소 글자는 무작위, 시·도 이름과 용어만 실제 낱말
export function fakeRows(n, seed = 7) {
  const rnd = k => (seed = (seed * 1103515245 + 12345) % 2147483648) % k;
  const SY = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초'.split('');
  const nm = k => Array.from({ length: k }, () => SY[rnd(SY.length)]).join('');
  const KIND = ['공동주택', '건축물', '판매시설', '업무시설', '교육연구시설'], SIDO = ['부산광역시', '울산광역시', '경상남도'];
  return Array.from({ length: n }, (_, i) => {
    const f = nm(2 + rnd(3)) + ['아파트', '빌딩', '타워', '센터', ''][rnd(5)];
    const d = `2026-11-${String(2 + Math.floor(i / 4)).padStart(2, '0')}`;
    return { no: i + 1, facility: f, owner: rnd(3) ? f + ' 관리사무소' : '(주)' + nm(3), location: `${SIDO[rnd(3)]} ${nm(2)}구 ${nm(2)}로 ${1 + rnd(999)}`,
      kind: KIND[rnd(5)], grade: ['1종', '2종', '3종'][rnd(3)], completed: `${1980 + rnd(40)}.${String(1 + rnd(12)).padStart(2, '0')}.${String(1 + rnd(28)).padStart(2, '0')}`,
      service: ['정기안전점검', '정밀안전점검'][rnd(2)], safetyGrade: 'ABCD'[rnd(4)], year: String(2019 + rnd(6)),
      travelers: ['시험자갑', '시험자을', '시험자병'].slice(0, 2 + rnd(2)), travelerCount: 0,
      dateKey: d, dateLabel: `${d} (${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})`, wd: '일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()],
      ampm: ['오전', '오후', ''][rnd(3)], buildings: String(1 + rnd(20)), phone: `000-0000-${String(rnd(10000)).padStart(4, '0')}`, contact: '담당' + nm(2) };
  });
}
