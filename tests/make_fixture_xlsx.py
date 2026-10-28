"""테스트용 가짜 대상목록 엑셀을 만든다. (실제 시설물·사람 정보 없음)
실제 파일과 같은 구조: 1행 병합 제목, 2행 빈칸(병합), 3행 머리글, 4~10행 7건, P열 SUM 계산식, 빈 연락처, 끝 빈 행
사용: python3 tests/make_fixture_xlsx.py
결과: tests/fixtures/sample_list.xlsx, tests/fixtures/sample_list_alias.xlsx
"""
import datetime, pathlib, sys
from openpyxl import Workbook

if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
OUT = pathlib.Path(__file__).resolve().parent / 'fixtures'
SHEET = '99년 9차 사실관계조사 시설물'
HEAD = ['연번', '시설물명', '수신처', '주소', '시설물종류', '종별', '준공일', '용역종류', '등급', '출장자',
        '날짜(오전,오후)', '동수', '연락처', '담당자']
D = datetime.datetime
# 날짜: 문자열 4건 + 엑셀 날짜(숫자) 3건
ROWS = [
    [1, '가나아파트', '가나아파트 관리사무소', '가상도 가상시 가상구 가상동 1', '공동주택', '2종', '2001-01-01', '정밀안전점검', 'B', '시험자갑, 시험자을', '2026-11-02 (월)', 6, '000-0000-0001', ''],
    [2, '다라아파트', '다라아파트 관리사무소', '가상도 가상시 가상구 가상동 2', '공동주택', '2종', D(2002, 2, 2), '정밀안전점검', 'C', '시험자갑, 시험자을', D(2026, 11, 2), 4, None, '시험담당'],
    [3, '마바아파트', '마바아파트 관리사무소', '가상도 가상시 나상구 나상동 3', '공동주택', '3종', '2003.3.3', '정밀안전진단', 'D', '시험자갑, 시험자을, 시험자병', '2026.11.3 오전', 3, '000-0000-0003', None],
    [4, '사아빌딩', '(주)사아관리', '가상도 가상시 나상구 나상동 4', '건축물', '2종', '2004-04-04', '정기안전점검', 'A', '시험자갑, 시험자을', D(2026, 11, 3), 1, None, None],
    [5, '자차아파트', '자차아파트 관리사무소', '가상도 가상시 다상구 다상동 5', '공동주택', '2종', '준공일 미상', '정밀안전점검', 'B', '시험자갑, 시험자을', '2026-11-03 오후', 8, '000-0000-0005', ''],
    [6, '카타아파트', '카타아파트 관리사무소', '가상도 가상시 다상구 다상동 6', '공동주택', '3종', D(2006, 6, 6), '정밀안전점검', 'E', '시험자갑', D(2026, 11, 4), 2, None, None],
    [7, '파하아파트', '파하아파트 관리사무소', '가상도 가상시 라상구 라상동 7', '공동주택', '2종', '2007-07-07', '정밀안전점검', 'B', '시험자갑, 시험자을', '2026. 11. 4. (수)', 5, '000-0000-0007', ''],
]


def make(path, head):
    wb = Workbook(); ws = wb.active; ws.title = SHEET
    ws['A1'] = '붙임1. 사실관계조사 대상시설물 목록(건축)'; ws.merge_cells('A1:L1')
    ws.merge_cells('A2:H2')
    ws.append(head)  # 3행
    for r in ROWS:
        ws.append(r)
        c = ws.cell(row=ws.max_row, column=7)
        if isinstance(c.value, D): c.number_format = 'yyyy-mm-dd'
        c = ws.cell(row=ws.max_row, column=11)
        if isinstance(c.value, D): c.number_format = 'yyyy-mm-dd'
    ws['P10'] = '=SUM(L4:L10)'   # 머리글 밖의 계산식 (무시되어야 함)
    ws['P3'] = '합계'
    ws.append([])                 # 11행 빈 행
    ws['A12'] = '※ 비고: 이 줄은 목록이 끝난 뒤라 읽지 않아야 함'
    wb.save(path)


OUT.mkdir(exist_ok=True)
make(OUT / 'sample_list.xlsx', HEAD)
alias = list(HEAD); alias[1] = '시설명'; alias[10] = '일자'; alias[3] = '소 재 지'
make(OUT / 'sample_list_alias.xlsx', alias)
print('가짜 엑셀 생성:', OUT / 'sample_list.xlsx', OUT / 'sample_list_alias.xlsx')
