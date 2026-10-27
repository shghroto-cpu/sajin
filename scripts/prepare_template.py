"""
한글 원본 양식(.hwpx)에서 웹앱용 양식 데이터(template/tpl.json, template/base.b64)를 만든다.

사용:
    pip install lxml pillow
    python scripts/prepare_template.py template/source/원본양식.hwpx

원본 양식이 바뀌었을 때(문구, 붙임, 표지 등)만 다시 실행한다.
문단은 '글자 내용'으로 찾으므로, 아래 기준 문구가 원본에 남아 있어야 한다.
  표지 연월(예: 2026. 10.), 개 요, 목    적, 점검기간, 점 검 자, 시설물 현황, 시설물명, 관리주체,
  위    치, 시설물 상세내용, 주요항목, 합동점검 결과, 보수, 부실예방
"""
import base64, io, json, re, sys, zipfile
from pathlib import Path
from lxml import etree
from PIL import Image

HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
ROOT = Path(__file__).resolve().parent.parent


def die(msg):
    sys.exit('[오류] ' + msg)


def main(src):
    zf = zipfile.ZipFile(src)
    raw = zf.read('Contents/section0.xml').decode('utf-8')
    sec_open = raw[:raw.index('>', raw.index('<hs:sec')) + 1]
    r = etree.fromstring(raw.encode('utf-8'))
    paras = list(r)
    text = [''.join(p.itertext()).strip() for p in paras]

    def ser(el):
        return re.sub(r' xmlns:\w+="[^"]+"', '', etree.tostring(el, encoding='unicode'))

    def nolseg(s):
        return re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>', '', s, flags=re.S)

    def find(pred, start=0, what=''):
        for i in range(start, len(paras)):
            if pred(i):
                return i
        die(f'원본에서 "{what}" 문단을 찾지 못했습니다.')

    def starts(prefix, start=0):
        return find(lambda i: text[i].replace(' ', '').startswith(prefix.replace(' ', '')), start, prefix)

    def pics(i):
        return len(paras[i].findall('.//' + HP + 'pic'))

    def has_tbl(i):
        return paras[i].find('.//' + HP + 'tbl') is not None

    def first_charpr(i):
        rn = paras[i].find(HP + 'run')
        return rn.get('charPrIDRef') if rn is not None else '10'

    def shell(i, runs):
        s = ser(paras[i])
        head = s[:s.index('>') + 1]
        return head + ''.join(f'<hp:run charPrIDRef="{c}"><hp:t>{t}</hp:t></hp:run>' for c, t in runs) + '</hp:p>'

    def run_charprs(i):
        return [rn.get('charPrIDRef') for rn in paras[i].findall(HP + 'run')]

    # ---- 기준 문단 찾기 ----
    i_ov = starts('개 요')
    i_date = find(lambda i: re.fullmatch(r'\d{4}\.\s*\d{1,2}\.', text[i]) is not None, 0, '표지 연월')
    if i_date > i_ov:
        die('표지 연월 문단이 개요보다 뒤에 있습니다.')
    i_pur, i_per, i_ins = starts('목 적', i_ov), starts('점검기간', i_ov), starts('점 검 자', i_ov)
    i_hfac = starts('시설물 현황', i_ov)
    i_fac, i_own, i_loc = starts('시설물명', i_hfac), starts('관리주체', i_hfac), starts('위 치', i_hfac)
    i_det = starts('시설물 상세내용', i_hfac)
    i_ftb = find(lambda i: has_tbl(i), i_det + 1, '시설물 상세 표')
    i_hit = starts('주요항목', i_ftb)
    i_item = i_hit + 1
    i_hres = starts('합동점검 결과', i_hit)
    i_sec = i_hres + 1
    i_op = i_sec + 1
    i_hprop = starts('보수', i_hres)
    i_prop = i_hprop + 1
    i_att = find(lambda i: has_tbl(i) and pics(i) == 0 and '붙임' in text[i], i_hprop, '제안의 붙임1 문단')
    i_ref = find(lambda i: '부실예방' in text[i], i_hprop, '부실예방을 위한 참고사항')
    photo_rows = [i for i in range(i_hprop, i_ref) if pics(i) == 2 and has_tbl(i)]
    if not photo_rows:
        photo_rows = [i for i in range(i_hres, i_ref) if pics(i) == 2 and has_tbl(i)]
    if not photo_rows:
        die('사진 2장짜리 표 문단을 찾지 못했습니다.')
    i_photo = photo_rows[0]
    i_tail = max(i for i in range(i_hres, i_ref) if pics(i) > 0) + 1

    T = {'secOpen': sec_open}
    p_date = ser(paras[i_date])
    p_date = p_date.replace(f'<hp:t>{text[i_date]}</hp:t>', '<hp:t>{{DATE}}</hp:t>', 1)
    if '{{DATE}}' not in p_date:
        die('표지 연월 글자를 바꿀 수 없습니다. 연월이 한 덩어리 글자인지 확인하세요.')
    T['head'] = ''.join(ser(paras[i]) for i in range(0, i_date)) + p_date + ''.join(ser(paras[i]) for i in range(i_date + 1, i_ov + 1))

    cp = run_charprs(i_pur)
    T['purpose'] = shell(i_pur, [(cp[0], '목    적 : '), (cp[1] if len(cp) > 1 else cp[0], '{{T}}')])
    T['period'] = shell(i_per, [(first_charpr(i_per), '점검기간 : {{T}}')])
    ci = run_charprs(i_ins)
    T['inspectors'] = shell(i_ins, [(ci[0], '점 검 자 : {{A}}'), (ci[1] if len(ci) > 1 else ci[0], '{{B}}')])
    T['h_facility'] = ser(paras[i_hfac])
    T['facility'] = shell(i_fac, [(first_charpr(i_fac), '시설물명 : {{T}}')])
    T['owner'] = shell(i_own, [(first_charpr(i_own), '관리주체 : {{T}}')])
    T['location'] = shell(i_loc, [(first_charpr(i_loc), '위    치 : {{T}}')])
    T['detail'] = ser(paras[i_det])

    # 시설물 상세 표: 마지막 행(값)의 칸을 {{K0}}~{{K6}}, 안전등급 괄호부분 {{K7}}
    fp = paras[i_ftb]
    tcs = list(fp.iter(HP + 'tc'))
    last_row = max(int(tc.find(HP + 'cellAddr').get('rowAddr')) for tc in tcs)
    vals = sorted([tc for tc in tcs if int(tc.find(HP + 'cellAddr').get('rowAddr')) == last_row],
                  key=lambda tc: int(tc.find(HP + 'cellAddr').get('colAddr')))
    for k, tc in enumerate(vals):
        p = tc.find('.//' + HP + 'p')
        runs = p.findall(HP + 'run')
        small = next((rn.get('charPrIDRef') for rn in runs[1:] if '(' in ''.join(rn.itertext())), None)
        for rn in runs[1:]:
            p.remove(rn)
        for ch in list(runs[0]):
            runs[0].remove(ch)
        etree.SubElement(runs[0], HP + 't').text = '{{K%d}}' % k
        if k == len(vals) - 1:
            r2 = etree.Element(HP + 'run'); r2.set('charPrIDRef', small or runs[0].get('charPrIDRef'))
            etree.SubElement(r2, HP + 't').text = '{{K%d}}' % (k + 1)
            runs[0].addnext(r2)
        la = p.find(HP + 'linesegarray')
        if la is not None:
            p.remove(la)
    if len(vals) != 7:
        die(f'시설물 상세 표의 값 칸이 7개가 아닙니다({len(vals)}개). 앱의 K0~K7 연결을 수정해야 합니다.')
    T['ftable'] = nolseg(ser(fp))

    T['h_items'] = ser(paras[i_hit])
    T['item'] = shell(i_item, [(first_charpr(i_item), '{{T}}')])
    T['h_result'] = shell(i_hres, [(first_charpr(i_hres), '{{T}}')])
    T['secTitle'] = shell(i_sec, [(first_charpr(i_sec), '{{T}}')])
    T['opinion'] = shell(i_op, [(first_charpr(i_op), '{{T}}')])
    T['h_prop'] = ser(paras[i_hprop])
    T['prop'] = shell(i_prop, [(first_charpr(i_prop), '{{T}}')])
    T['prop_att1'] = ser(paras[i_att])
    T['tail'] = ''.join(ser(paras[i]) for i in range(i_tail, len(paras))) + '</hs:sec>'

    # ---- 사진 표 매개변수화 ----
    s = nolseg(ser(paras[i_photo]))
    pic_list = re.findall(r'<hp:pic .*?</hp:pic>', s, flags=re.S)
    p0 = pic_list[0]
    g = lambda pat: re.search(pat, p0).groups()
    ow, oh = g(r'<hp:orgSz width="(\d+)" height="(\d+)"/>')
    cw, ch = g(r'<hp:curSz width="(\d+)" height="(\d+)"/>')
    dw, dh = g(r'<hp:imgDim dimwidth="(\d+)" dimheight="(\d+)"/>')
    p = re.sub(r'<hp:pic id="\d+" zOrder="\d+"', '<hp:pic id="{{PID}}" zOrder="{{PZ}}"', p0)
    p = re.sub(r'instid="\d+"', 'instid="{{INST}}"', p)
    p = re.sub(r'<hp:orgSz [^>]*/>', '<hp:orgSz width="{{OW}}" height="{{OH}}"/>', p)
    p = re.sub(r'<hp:curSz [^>]*/>', '<hp:curSz width="{{CW}}" height="{{CH}}"/>', p)
    p = re.sub(r'centerX="\d+" centerY="\d+"', 'centerX="{{CX}}" centerY="{{CY}}"', p)
    p = re.sub(r'<hc:scaMatrix [^>]*/>', '<hc:scaMatrix e1="{{SX}}" e2="0" e3="0" e4="0" e5="{{SY}}" e6="0"/>', p)
    p = re.sub(r'binaryItemIDRef="\w+"', 'binaryItemIDRef="{{BIN}}"', p)
    p = re.sub(r'<hp:imgRect>.*?</hp:imgRect>', '<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="{{OW}}" y="0"/><hc:pt2 x="{{OW}}" y="{{OH}}"/><hc:pt3 x="0" y="{{OH}}"/></hp:imgRect>', p, flags=re.S)
    p = re.sub(r'<hp:imgClip [^>]*/>', '<hp:imgClip left="0" right="{{DW}}" top="0" bottom="{{DH}}"/>', p)
    p = re.sub(r'<hp:imgDim [^>]*/>', '<hp:imgDim dimwidth="{{DW}}" dimheight="{{DH}}"/>', p)
    p = re.sub(r'<hp:sz width="\d+" widthRelTo="ABSOLUTE" height="\d+"', '<hp:sz width="{{CW}}" widthRelTo="ABSOLUTE" height="{{CH}}"', p)
    p = re.sub(r'<hp:shapeComment>.*?</hp:shapeComment>', '<hp:shapeComment>그림입니다.\n원본 그림의 이름: {{NAME}}</hp:shapeComment>', p, flags=re.S)
    for k in ['PID', 'PZ', 'INST', 'OW', 'OH', 'CW', 'CH', 'CX', 'CY', 'SX', 'SY', 'BIN', 'DW', 'DH', 'NAME']:
        if '{{%s}}' % k not in p:
            die(f'사진 틀에서 {k} 항목을 만들지 못했습니다.')
    T['pic'] = p
    s = s.replace(pic_list[0], '{{PIC1}}').replace(pic_list[1], '{{PIC2}}')
    s = re.sub(r'<hp:tbl id="\d+" zOrder="\d+"', '<hp:tbl id="{{TID}}" zOrder="{{TZ}}"', s, count=1)
    tcs = re.findall(r'<hp:tc .*?</hp:tc>', s, flags=re.S)
    if len(tcs) != 6:
        die('사진 표가 2행 3열(사진·간격·사진 / 캡션·간격·캡션)이 아닙니다.')
    photo_bf = re.search(r'borderFillIDRef="(\d+)"', tcs[0]).group(1)
    gap_bf = re.search(r'borderFillIDRef="(\d+)"', tcs[1]).group(1)

    def cap_param(tc, tag):
        inner = re.search(r'<hp:subList[^>]*>(.*?)</hp:subList>', tc, flags=re.S)
        return tc.replace(inner.group(1), '{{%s}}' % tag)
    new = [tcs[0], tcs[1], tcs[2], cap_param(tcs[3], 'CAP1'), tcs[4], cap_param(tcs[5], 'CAP2')]
    for idx, tag in [(0, 'BF1'), (2, 'BF2'), (3, 'BF1'), (5, 'BF2')]:
        new[idx] = new[idx].replace(f'borderFillIDRef="{photo_bf}"', 'borderFillIDRef="{{%s}}"' % tag, 1)
    row_h = re.search(r'<hp:cellSz width="\d+" height="(\d+)"/>', tcs[0]).group(1)
    tbl_h = re.search(r'<hp:sz width="\d+" widthRelTo="ABSOLUTE" height="(\d+)"', s).group(1)
    for a, b in zip(tcs, new):
        s = s.replace(a, b, 1)
    s = s.replace(f'height="{row_h}"', 'height="{{RH}}"').replace(f'height="{tbl_h}"', 'height="{{TH}}"', 1)
    caps = re.findall(r'<hp:p [^>]*>.*?</hp:p>', re.search(r'<hp:subList[^>]*>(.*?)</hp:subList>', tcs[3], flags=re.S).group(1), flags=re.S)
    if len(caps) < 2:
        die('사진 캡션 칸에 제목·설명 두 줄이 있어야 합니다.')
    T['capTitle'] = re.sub(r'<hp:t>.*?</hp:t>', '<hp:t>{{T}}</hp:t>', caps[0])
    T['capDesc'] = re.sub(r'<hp:t>.*?</hp:t>', '<hp:t>{{T}}</hp:t>', caps[1])
    cap_head = caps[0][:caps[0].index('>') + 1]
    cap_cp = re.search(r'<hp:run charPrIDRef="(\d+)"', caps[0]).group(1)
    T['capEmpty'] = f'{cap_head}<hp:run charPrIDRef="{cap_cp}"/></hp:p>'
    T['photoTbl'] = s
    T['photoBorder'] = photo_bf
    T['gapBorder'] = gap_bf
    T['picBox'] = [int(cw), int(ch)]

    # ---- 고정 이미지만 남긴 기본 패키지 ----
    keep_paras = list(range(0, i_ov + 1)) + [i_att] + list(range(i_tail, len(paras)))
    fixed = set()
    for i in keep_paras:
        fixed |= set(re.findall(r'binaryItemIDRef="(\w+)"', etree.tostring(paras[i], encoding='unicode')))
    hpf = zf.read('Contents/content.hpf').decode('utf-8')
    items, out = [], io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in zf.namelist():
            if n.startswith('BinData/'):
                stem, ext = Path(n).stem, Path(n).suffix.lower()
                if stem not in fixed:
                    continue
                data = zf.read(n)
                if ext == '.bmp':
                    b = io.BytesIO(); Image.open(io.BytesIO(data)).save(b, 'PNG', optimize=True)
                    data, name, mt = b.getvalue(), f'BinData/{stem}.png', 'image/png'
                else:
                    name, mt = n, {'.png': 'image/png', '.gif': 'image/gif'}.get(ext, 'image/jpg')
                z.writestr(name, data)
                items.append(f'<opf:item id="{stem}" href="{name}" media-type="{mt}" isEmbeded="1"/>')
            elif n in ('mimetype', 'Contents/section0.xml', 'Contents/content.hpf', 'Preview/PrvText.txt'):
                continue
            else:
                z.writestr(n, zf.read(n))
    hpf = re.sub(r'<opf:item id="image\d+"[^>]*/>', '', hpf)
    hpf = hpf.replace('<opf:item id="section0"', '{{ITEMS}}<opf:item id="section0"')
    hpf = re.sub(r'<opf:title>.*?</opf:title>', '<opf:title>{{TITLE}}</opf:title>', hpf)
    T['hpf'] = hpf
    T['fixedItems'] = ''.join(items)

    (ROOT / 'template').mkdir(exist_ok=True)
    (ROOT / 'template/tpl.json').write_text(json.dumps(T, ensure_ascii=False), encoding='utf-8')
    (ROOT / 'template/base.b64').write_text(base64.b64encode(out.getvalue()).decode())
    print(f'완료: tpl.json {len(json.dumps(T, ensure_ascii=False)) // 1024}KB, base.b64 {len(out.getvalue()) * 4 // 3 // 1024}KB')
    print(f'사용한 문단: 표지연월 {i_date}, 개요 {i_ov}, 사진표 {i_photo}, 고정꼬리 {i_tail}~끝')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        die('사용법: python scripts/prepare_template.py <원본양식.hwpx>')
    main(sys.argv[1])
