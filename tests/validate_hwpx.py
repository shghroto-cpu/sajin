"""생성된 HWPX의 구조를 검사한다. (한글 프로그램 없이 확인 가능한 범위)
사용: python3 tests/validate_hwpx.py tests/out/sample.hwpx [시설물명]
"""
import re, sys, zipfile
from lxml import etree

path = sys.argv[1]
facility = sys.argv[2] if len(sys.argv) > 2 else '시험체육관'
z = zipfile.ZipFile(path)
names = z.namelist()
errors = []
def check(cond, msg):
    if not cond: errors.append(msg)

check(names[0] == 'mimetype', 'mimetype이 첫 번째 파일이 아님')
check(z.getinfo('mimetype').compress_type == zipfile.ZIP_STORED, 'mimetype이 무압축이 아님')
check(z.read('mimetype') == b'application/hwp+zip', 'mimetype 내용 오류')
check(not any(n.endswith('/') for n in names), '폴더 항목이 들어 있음')
for f in ['Contents/section0.xml', 'Contents/content.hpf', 'Contents/header.xml', 'META-INF/container.xml', 'version.xml']:
    check(f in names, f'{f} 없음')

sec = z.read('Contents/section0.xml').decode('utf-8')
hpf = z.read('Contents/content.hpf').decode('utf-8')
for f, s in [('section0.xml', sec), ('content.hpf', hpf)]:
    try: etree.fromstring(s.encode('utf-8'))
    except Exception as e: errors.append(f'{f} XML 오류: {e}')
check(not re.search(r'\{\{\w+\}\}', sec + hpf), '채워지지 않은 {{자리표시}} 남음: ' + ', '.join(sorted(set(re.findall(r'\{\{\w+\}\}', sec + hpf)))[:5]))

refs = set(re.findall(r'binaryItemIDRef="(\w+)"', sec))
items = dict(re.findall(r'<opf:item id="(\w+)" href="([^"]+)"', hpf))
for r in refs:
    check(r in items, f'그림 {r}이 content.hpf 목록에 없음')
    check(r not in items or items[r] in names, f'그림 파일 {items.get(r)} 없음')
for kind in ['tbl', 'pic']:
    ids = re.findall(rf'<hp:{kind} id="(\d+)"', sec)
    check(len(ids) == len(set(ids)), f'{kind} id 중복')

texts = re.findall(r'<hp:t>([^<]*)</hp:t>', sec)
for must in ['개 요', f'시설물명 : {facility}', '외관조사의 적정성', '(슬래브 균열)', '보수', '부실예방']:
    check(any(must in t for t in texts), f'본문에 "{must}" 없음')

if errors:
    print('검사 실패:'); [print(' -', e) for e in errors]; sys.exit(1)
print(f'검사 통과: 그림 {len(refs)}개, 표 {sec.count("<hp:tbl ")}개, 문단 글자 {len(texts)}개')
