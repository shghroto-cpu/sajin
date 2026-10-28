"""휴대폰 화면 크기로 앱을 띄워 주요 흐름을 확인한다. (선택 테스트)
- 엑셀 불러오기(비상용) → 미리보기 → 등록 → 카드 7개, 날짜 묶음 3개, 시설물별 사진 분리
- 메일 공유·파일 저장 → 파일명에 시설물명과 엑셀 날짜(YYMMDD), 기관 메일 안내 문구
- 예전 평문 공유 링크(#list=) → 미지원 안내, 등록 안 됨
- 예전 버전(v2) 자료 → 시설물 1건으로 옮겨짐
- 대상목록 파일(.sajin, 기관 메일 첨부): 비밀번호·이름으로 팀 구분, 다른 팀 목록, 새 판 갱신, 옛 판 무시, 아무 파일 거부, 지시서 2 방식 자료 이어받기
- 오프라인 관리 파일(dist/admin.html): 모든 외부 요청 차단 상태로 .sajin 만들기
- 모든 흐름에서 data/lists 요청이 없어야 함 (목록을 외부에서 받지 않음)
준비: pip install playwright && playwright install chromium
사용: python3 tests/e2e_browser.py
"""
import asyncio, zipfile, pathlib, sys, subprocess, tempfile, shutil
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/out'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
URL = (ROOT / 'index.html').as_uri()
REPORT = '261103_관리주체_합동점검_결과_보고서(마바아파트).hwpx'
PASS = 'test-only-passphrase-0000'    # 1팀·3팀·4팀
PASS2 = 'test-only-passphrase-2222'   # 2팀 (팀마다 비밀번호가 다름)
REQUESTS = []   # 모든 페이지의 네트워크 요청 (data/lists 호출이 없어야 함)

# 예전 버전(v2): 보고서 1건을 'draft'에, 사진을 'photos'에 넣는다
SEED_V2 = """async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const g = c.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 400, 300);
  const buf = await (await new Promise(r => c.toBlob(r, 'image/jpeg', .8))).arrayBuffer();
  const db = await new Promise((res, rej) => { const r = indexedDB.open('sajindaeji', 1); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const draft = {v:2, crop:true, attach1:true, withPhotos:true,
    meta:{facility:'예전보고서체육관', owner:'예전관리주체', date:'2026. 10.', period:'2026. 10. 1.'},
    sections:[{id:'s1', title:'외관조사의 적정성', item:'외관조사 적정성 확인', opinion:'예전 의견', photos:[{id:'p1', w:400, h:300, label:'', desc:'예전 사진'}]},
              {id:'s9', type:'proposal', title:'보수・보강 및 유지관리 제안', opinion:'', photos:[]}]};
  await new Promise((res, rej) => { const t = db.transaction(['kv','photos'], 'readwrite');
    t.objectStore('kv').clear(); t.objectStore('photos').clear();
    t.objectStore('kv').put(JSON.stringify(draft), 'draft'); t.objectStore('photos').put({buf, type:'image/jpeg'}, 'p1');
    t.oncomplete = res; t.onerror = rej; });
  db.close();
}"""
# 지시서 2 방식(서버 팀 칸 2번)으로 받은 시설물 1곳 + 사진 1장이 있는 휴대폰
SEED_V3_SLOT = """async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const g = c.getContext('2d'); g.fillStyle = '#a73'; g.fillRect(0, 0, 400, 300);
  const buf = await (await new Promise(r => c.toBlob(r, 'image/jpeg', .8))).arrayBuffer();
  const db = await new Promise((res, rej) => { const r = indexedDB.open('sajindaeji', 1); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const site = {id:'site_old', no:1, slot:2, buildings:'3', phone:'', contact:'', travelers:['이팀 갑'], dateLabel:'2026-11-03', dateKey:'2026-11-03',
    savedAt:null, edited:[], managers:0, src:{no:1, facility:'마바아파트', dateKey:'2026-11-03', safetyGrade:'D', travelers:['이팀 갑']},
    meta:{facility:'마바아파트', location:'예전 주소'},
    sections:[{id:'s1', title:'외관조사의 적정성', item:'외관조사 적정성 확인', opinion:'', photos:[{id:'op1', w:400, h:300, label:'', desc:''}]},
              {id:'s9', type:'proposal', title:'보수・보강 및 유지관리 제안', opinion:'', photos:[]}]};
  const st = {v:3, batch:null, activeId:null, settings:{kindMode:'excel', crop:true, withPhotos:true, attach1:true}, sites:[site],
    remote:{slots:{2:{listVersion:'20261028-100000', teamName:'2팀 (시험권)', members:['이팀갑'], cleared:false}}, lastSync:null, myName:'이팀갑', nameAsked:true, chosen:{}}};
  await new Promise((res, rej) => { const t = db.transaction(['kv','photos'], 'readwrite');
    t.objectStore('kv').clear(); t.objectStore('photos').clear();
    t.objectStore('kv').put(JSON.stringify(st), 'appState'); t.objectStore('photos').put({buf, type:'image/jpeg'}, 'op1');
    t.oncomplete = res; t.onerror = rej; });
  db.close();
}"""
KV_KEYS = """async () => { const db = await new Promise(r => { const q = indexedDB.open('sajindaeji', 1); q.onsuccess = () => r(q.result); });
  return await new Promise(r => { const q = db.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => r(q.result); }); }"""


async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent=UA, accept_downloads=True)
    pg = await ctx.new_page()
    pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.dialogs = []
    pg.on('dialog', lambda d: (pg.dialogs.append(d.message), asyncio.ensure_future(d.accept())))
    pg.on('request', lambda r: REQUESTS.append(r.url))
    jszip = ROOT / 'node_modules/jszip/dist/jszip.min.js'
    if jszip.exists():  # 인터넷 없이도 돌도록 CDN 대신 로컬 파일 사용
        await pg.route('**/jszip.min.js', lambda r: r.fulfill(path=str(jszip), content_type='application/javascript'))
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await pg.add_init_script("window.__shared=null; navigator.canShare=()=>true; navigator.share=async d=>{window.__shared=(d.files||[]).map(f=>f.name)};")
    return ctx, pg


def card(pg, name):
    return pg.locator('.site', has_text=name)


async def shots(pg, name):
    await pg.screenshot(path=str(OUT / f'{name}.png'), full_page=True)
    await pg.emulate_media(color_scheme='dark'); await pg.screenshot(path=str(OUT / f'{name}_dark.png'), full_page=True)
    await pg.emulate_media(color_scheme='light')


async def load_file(pg, path):
    async with pg.expect_file_chooser() as fc: await pg.click('#listFileBtn')
    await (await fc.value).set_files(str(path))


async def msg(pg, text):
    await pg.wait_for_function("t => document.querySelector('#lmsg').textContent.includes(t)", arg=text)
    return await pg.text_content('#lmsg')


async def local_flow(b):
    ctx, pg = await new_page(b)
    await pg.goto(URL); await pg.wait_for_selector('#listView:not([hidden])')
    assert await pg.locator('.empty').count() == 1, '빈 목록 안내 없음'
    assert '기관 웹메일' in await pg.text_content('.empty'), '처음 사용자 안내 (사파리 웹메일 기준)'
    assert await pg.get_attribute('#listIn', 'accept') is None, '아이폰에서 .sajin 이 막히지 않도록 accept 없음'
    await pg.screenshot(path=str(OUT / 'screen_empty.png'), full_page=True)

    # 1) 엑셀(비상용) → 미리보기 → 등록
    await load_file(pg, ROOT / 'tests/fixtures/sample_list.xlsx')
    await pg.wait_for_selector('#dlg[open] .ptitle')
    assert '7개 시설' in await pg.text_content('.ptitle')
    assert '자차아파트: 준공일' in await pg.text_content('.warnbox'), '읽지 못한 칸 노란 표시 없음'
    await pg.click('#sheet button:has-text("등록")')
    await pg.wait_for_selector('.site')
    assert await pg.locator('.site').count() == 7, '카드 7개가 아님'
    assert len(await pg.locator('.day').all_text_contents()) == 3
    assert await card(pg, '마바아파트').locator('.tag.alert').count() == 1, 'D등급 강조 없음'

    # 2) 3번 시설물: 기본정보 → 사진 1장 → 메일·저장(기관 메일 안내)
    await card(pg, '마바아파트').locator('.site-open').click()
    await pg.wait_for_selector('#editView:not([hidden])')
    vals = await pg.eval_on_selector_all('#metaForm input[type=text]', 'els => els.map(e => e.value)')
    for v in ['마바아파트', '마바아파트 관리사무소', 'D (정밀진단)', '총 3명(국토안전관리원 3명)', '2026. 11. 3.', '2003.03.03']:
        assert v in vals, f'기본정보에 {v} 없음: {vals}'
    async with pg.expect_file_chooser() as fc: await pg.locator('.add').first.click()
    await (await fc.value).set_files(str(ROOT / 'tests/fixtures/landscape.jpg'))
    await pg.wait_for_selector('.ph')
    await pg.click('#mailBtn'); await pg.wait_for_function('window.__shared')
    shared = await pg.evaluate('window.__shared')
    assert shared[0] == REPORT, f'메일 공유 파일명 오류: {shared}'
    assert '기관 웹메일' in await pg.text_content('#msg'), '공유 안내가 기관 웹메일 기준이 아님'
    async with pg.expect_download() as dl: await pg.click('#saveBtn')
    out = OUT / 'bundle.zip'
    await (await dl.value).save_as(out)
    names = zipfile.ZipFile(out).namelist()
    assert REPORT in names and any(n.startswith('사진/') for n in names), f'저장 파일 구성 오류: {names}'
    m = await pg.text_content('#msg')
    assert '사파리에서 기관 웹메일' in m and '다운로드' in m, m
    await pg.screenshot(path=str(OUT / 'screen_saved.png'))
    await shots(pg, 'screen_edit')
    await pg.click('#backBtn'); await pg.wait_for_selector('#listView:not([hidden])')
    st = await card(pg, '마바아파트').locator('.state').text_content()
    assert '사진 1장' in st and '저장함' in st, st
    await card(pg, '자차아파트').locator('.site-open').click(); await pg.wait_for_selector('#editView:not([hidden])')
    assert await pg.locator('.ph').count() == 0, '다른 시설물 사진이 섞임'
    await pg.click('#backBtn'); await pg.wait_for_selector('#listView:not([hidden])')
    await pg.wait_for_timeout(600); await pg.reload(); await pg.wait_for_selector('.site')
    assert '사진 1장' in await card(pg, '마바아파트').locator('.state').text_content(), '새로고침 후 진행상태 사라짐'
    await shots(pg, 'screen_list')
    assert not pg.errs, pg.errs
    await ctx.close()

    # 3) 예전 평문 공유 링크 → 미지원 안내, 등록 안 됨
    ctx2, pg2 = await new_page(b)
    await pg2.goto(URL + '#list=AAAA'); await pg2.wait_for_selector('#listView:not([hidden])')
    assert '지원하지 않는' in await msg(pg2, '지원하지 않는')
    assert await pg2.locator('.site').count() == 0 and '#list=' not in pg2.url
    await ctx2.close()

    # 4) 예전 버전(v2) 자료 옮기기
    ctx3, pg3 = await new_page(b)
    await pg3.goto(URL); await pg3.wait_for_selector('#listView:not([hidden])'); await pg3.wait_for_timeout(600)
    await pg3.evaluate(SEED_V2)
    await pg3.reload(); await pg3.wait_for_selector('#editView:not([hidden]) .ph')
    assert '예전보고서체육관' in await pg3.text_content('#hdrSub')
    assert await pg3.locator('.ph').count() == 1, '예전 사진이 옮겨지지 않음'
    keys = await pg3.evaluate(KV_KEYS)
    assert 'appState' in keys and 'draft' not in keys, keys
    assert not pg3.errs, pg3.errs
    await ctx3.close()
    print(f'기본 흐름 통과: 엑셀 등록 7곳, 사진 분리, 파일명 {REPORT}, 기관 메일 안내, 공유 링크 미지원, 예전 자료 옮기기')


async def list_flow(b, fx):
    # 1) 빈 화면 → 2팀 .sajin → 틀린 비밀번호 → 맞는 비밀번호 → 이름(2팀) → 2팀 5곳
    ctx, A = await new_page(b)
    await A.goto(URL); await A.wait_for_selector('.empty')
    await load_file(A, fx / 'team2.sajin'); await A.wait_for_selector('#passIn')
    assert '팀 비밀번호를 입력하세요' in await A.text_content('.keycard')
    await A.screenshot(path=str(OUT / 'screen_password.png'))
    await A.fill('#passIn', 'wrong-passphrase-00000'); await A.click('.keycard button:has-text("확인")')
    await A.wait_for_function("document.querySelector('.keycard .msg').textContent.includes('맞지 않습니다')")
    await A.fill('#passIn', PASS); await A.click('.keycard button:has-text("확인")')   # 1팀 비밀번호로는 2팀 목록이 안 열림
    await A.wait_for_function("document.querySelector('.keycard .msg').textContent.includes('맞지 않습니다')")
    await A.fill('#passIn', PASS2); await A.click('.keycard button:has-text("확인")')
    m = await msg(A, '등록했습니다'); assert '2팀 (시험권) · 99년 9차 · 5곳을 등록했습니다' in m, m
    await A.wait_for_selector('#nameIn'); await A.fill('#nameIn', '이팀갑'); await A.click('.keycard button:has-text("확인")')
    await A.wait_for_selector('#siteList .site')
    assert await A.locator('#siteList .site').count() == 5, '2팀 5곳만'
    assert '2팀' in await A.text_content('#batchName')
    await A.screenshot(path=str(OUT / 'screen_imported.png'), full_page=True)
    # 2) 1팀 .sajin → 1팀 비밀번호를 따로 물음 → 여전히 2팀만, 「다른 팀 보기」에 1팀
    await load_file(A, fx / 'team1.sajin'); await A.wait_for_selector('#passIn')
    assert '이 목록의 팀 비밀번호' in await A.text_content('.keycard')
    await A.screenshot(path=str(OUT / 'screen_password_other.png'))
    await A.fill('#passIn', PASS); await A.click('.keycard button:has-text("확인")')
    assert '다른 팀 보기' in await msg(A, '1팀 (시험권)')
    assert await A.locator('#passIn').count() == 0
    assert await A.locator('#siteList .site').count() == 5
    await A.click('.others > summary')
    assert await A.locator('#otherTeams .site').count() == 7 and '1팀 (시험권)' in await A.text_content('#otherTeams')
    # 3) 2팀 공통 시설물에 사진 1장 → 2팀 새 판 → 사진 유지·갱신, 1팀 같은 시설물은 사진 0장
    await A.locator('#siteList .site', has_text='마바아파트').locator('.site-open').click()
    await A.wait_for_selector('#editView:not([hidden])')
    async with A.expect_file_chooser() as fc: await A.locator('.add').first.click()
    await (await fc.value).set_files(str(ROOT / 'tests/fixtures/landscape.jpg'))
    await A.wait_for_selector('.ph'); await A.click('#backBtn'); await A.wait_for_selector('#siteList .site')
    await load_file(A, fx / 'team2_v2.sajin')   # 2팀 키가 이미 있으면 다시 묻지 않음
    m = await msg(A, '갱신했습니다'); assert '갱신 5곳, 추가 1곳' in m, m
    assert await A.locator('#siteList .site').count() == 6
    assert '사진 1장' in await A.locator('#siteList .site', has_text='마바아파트').locator('.state').text_content(), '갱신 후 사진 유지'
    assert '변경된주소 1' in await A.locator('#siteList .site', has_text='이팀가빌딩').text_content()
    await A.click('.others > summary')
    assert '사진 0장' in await A.locator('#otherTeams .site', has_text='마바아파트').locator('.state').text_content(), '팀이 다른 같은 시설물은 따로'
    # 4) 옛 판 → 무시
    await load_file(A, fx / 'team2.sajin')
    assert '이미 더 최신 목록' in await msg(A, '이미 더 최신')
    assert await A.locator('#siteList .site').count() == 6
    # 5) 아무 파일 → 거부
    await load_file(A, ROOT / 'tests/fixtures/landscape.jpg')
    assert '대상목록 파일이 아닙니다' in await msg(A, '대상목록 파일이 아닙니다')
    # 새로고침해도 키·이름 유지, 목록 지우기(사진 있으면 한 번 더 확인)
    await A.wait_for_timeout(600); await A.reload(); await A.wait_for_selector('#siteList .site')
    assert await A.locator('#passIn').count() == 0 and await A.locator('#nameIn').count() == 0
    A.dialogs.clear(); await A.click('#listInfo button:has-text("이 목록 지우기")')
    await msg(A, '목록을 지웠습니다')
    assert len(A.dialogs) == 2 and '사진이 있는 시설물' in A.dialogs[1], A.dialogs
    assert not A.errs, A.errs
    await ctx.close()

    # 6) 이름 없이 → 팀 선택 → 1팀
    ctxB, B = await new_page(b)
    await B.goto(URL); await load_file(B, fx / 'team1.sajin'); await B.wait_for_selector('#passIn')
    await B.fill('#passIn', PASS); await B.click('.keycard button:has-text("확인")')
    await B.wait_for_selector('#nameIn'); await B.click('.keycard button:has-text("건너뛰기")')
    await load_file(B, fx / 'team2.sajin'); await B.wait_for_selector('#passIn')
    await B.fill('#passIn', PASS2); await B.click('.keycard button:has-text("확인")'); await msg(B, '2팀')
    await B.wait_for_selector('.pick'); assert await B.locator('.pick').count() == 2
    await B.screenshot(path=str(OUT / 'screen_team_pick.png'))
    await B.locator('.pick', has_text='1팀').locator('input').check()
    await B.click('.keycard button:has-text("선택한 팀 목록 보기")'); await B.wait_for_selector('#siteList .site')
    assert await B.locator('#siteList .site').count() == 7
    assert not B.errs, B.errs
    await ctxB.close()

    # 7) 지시서 2 방식(서버 팀 칸)으로 받은 자료가 있는 휴대폰 → 새 목록 파일 → 시설물·사진 유지
    ctxL, L = await new_page(b)
    await L.goto(URL); await L.wait_for_selector('#listView:not([hidden])'); await L.wait_for_timeout(600)
    await L.evaluate(SEED_V3_SLOT); await L.reload(); await L.wait_for_selector('.site')
    assert '이전 방식으로 받은 목록' in await L.text_content('.site'), '이전 방식 표시'
    await load_file(L, fx / 'team2.sajin'); await L.wait_for_selector('#passIn')
    await L.fill('#passIn', PASS2); await L.click('.keycard button:has-text("확인")')
    await msg(L, '등록했습니다')
    assert await L.locator('#nameIn').count() == 0, '이전에 입력한 이름 유지'
    await L.wait_for_selector('#siteList .site')
    assert await L.locator('#siteList .site').count() == 5, '이전 시설물이 새 목록에 합쳐짐'
    old = L.locator('#siteList .site', has_text='마바아파트')
    assert '사진 1장' in await old.locator('.state').text_content(), '이전 사진 유지'
    assert '이전 방식' not in await L.text_content('#siteList')
    assert not L.errs, L.errs
    await ctxL.close()
    print('대상목록 파일 흐름 통과: 비밀번호·이름(2팀 5곳)·다른 팀 보기·새 판 갱신(사진 유지)·옛 판 무시·아무 파일 거부·팀 선택(1팀 7곳)·이전 방식 자료 이어받기·목록 지우기')


async def admin_flow(b, fx):
    # 오프라인 관리 파일: 외부 요청을 모두 막고 file:// 로 열기
    admin = ROOT / 'dist/admin.html'
    ctx = await b.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)
    pg = await ctx.new_page()
    errs, external = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    async def guard(route):
        if route.request.url.startswith('file:'): await route.continue_()
        else: external.append(route.request.url); await route.abort()
    await ctx.route('**/*', guard)
    await pg.goto(admin.as_uri()); await pg.wait_for_selector('#admTeam')
    assert '사실관계조사' in await pg.text_content('h1')
    assert not await pg.is_visible('#admPass'), '팀을 정하기 전에는 비밀번호 칸 없음'
    await pg.fill('#admTeam', '4팀 (시험권)'); await pg.click('#admTeamOk'); await pg.wait_for_selector('#admPass:visible')
    assert '4팀 (시험권) 비밀번호' in await pg.text_content('#adminView')
    await pg.fill('#admPass', PASS); await pg.fill('#admPass2', 'different-passphrase-0')
    await pg.click('#admPassOk'); await pg.wait_for_function("document.body.textContent.includes('다릅니다')")
    await pg.fill('#admPass2', PASS); await pg.click('#admPassOk'); await pg.wait_for_selector('#admXlsBtn:visible')
    async with pg.expect_file_chooser() as fc: await pg.click('#admXlsBtn')
    await (await fc.value).set_files(str(ROOT / 'tests/fixtures/sample_list.xlsx'))
    await pg.wait_for_selector('.admprev .plist')
    async with pg.expect_download() as dl: await pg.click('#admMake')
    d = await dl.value
    assert d.suggested_filename == '대상목록_4팀시험권_99-9.sajin', d.suggested_filename
    made = fx / d.suggested_filename; await d.save_as(made)
    assert '가나아파트' not in made.read_text(encoding='utf-8'), '평문 노출'
    await pg.wait_for_selector('.guide:not([hidden])')
    body = await pg.input_value('#admMailBody')
    assert '웹메일' in body, body
    assert 'github.io' in body and PASS not in body and '가나아파트' not in body, body
    await pg.screenshot(path=str(OUT / 'screen_admin.png'), full_page=True)
    # 이전 목록 파일로 갱신: 바뀐 시설물 표시
    async with pg.expect_file_chooser() as fc: await pg.click('#admPrevBtn')
    await (await fc.value).set_files(str(made))
    await pg.wait_for_function("document.body.textContent.includes('이전 목록과 바뀐 시설물')")
    # QR 만들기 (1장) → 여러 장(조각 길이를 줄여 시험) → 한 화면에 모두 → 인쇄용 보기(목록 내용 글자 없음) → 4cm
    await pg.click('#admQR'); await pg.wait_for_selector('#admQrView:not([hidden]) svg')
    assert 'QR 1장을 만들었습니다' in await pg.text_content('#adminView'), await pg.text_content('#adminView .msg')
    assert await pg.locator('#admQrView svg').count() == 1 and '4팀 (시험권)' in await pg.text_content('#admQrView')
    await pg.locator('#admQrView').screenshot(path=str(OUT / 'screen_admin_qr.png'))
    await pg.evaluate('SajinQR.MAX_URL = 600'); await pg.click('#admQR')
    await pg.wait_for_selector('#admQrNext'); assert '1 / ' in await pg.text_content('#admQrView .qrno')
    await pg.click('#admQrNext'); assert '2 / ' in await pg.text_content('#admQrView .qrno')
    await pg.click('#admQrAll'); n = await pg.locator('#admQrView svg').count(); assert n >= 2, n
    await pg.locator('#admQrView').screenshot(path=str(OUT / 'screen_admin_qr2.png'))
    await pg.click('#admQrPrint'); await pg.wait_for_selector('#admPrint .ppage')
    ptxt = await pg.text_content('#admPrint .ppage')
    for s in ['가나아파트', '다라아파트', '가상도', '000-0000', '시험자갑']: assert s not in ptxt, f'인쇄물에 {s}'
    assert await pg.locator('#admPrint .ppage svg').count() == min(n, 4)
    await pg.locator('#admPrint .ppage').screenshot(path=str(OUT / 'screen_admin_print.png'))
    await pg.check('#admQrSmall'); await pg.wait_for_selector('#admPrint .ppage.small')
    w = await pg.evaluate("document.querySelector('#admPrint .pfig .qrbox').getBoundingClientRect().width")
    assert 145 < w < 160, f'4cm 아님: {w}px'
    await pg.locator('#admPrint .ppage').screenshot(path=str(OUT / 'screen_admin_print_small.png'))
    await pg.emulate_media(media='print')
    await pg.evaluate("document.body.classList.add('printing')")
    assert await pg.evaluate("getComputedStyle(document.querySelector('#admPass')).visibility") == 'hidden', '인쇄 때 다른 화면 숨김'
    await pg.emulate_media(media='screen'); await pg.evaluate("document.body.classList.remove('printing')")
    assert not errs, errs
    assert not external, f'외부 요청 발생: {external}'
    await ctx.close()
    # 만든 파일을 휴대폰에서 열기
    ctxP, P = await new_page(b)
    await P.goto(URL); await load_file(P, made); await P.wait_for_selector('#passIn')
    await P.fill('#passIn', PASS); await P.click('.keycard button:has-text("확인")')
    assert '4팀 (시험권) · 99년 9차 · 7곳을 등록했습니다' in await msg(P, '등록했습니다')
    # 앱의 #admin 도 같은 화면
    await P.goto(URL + '#admin'); await P.wait_for_selector('#admTeam')   # 앱이 #admin 으로 바뀌면 스스로 다시 열림
    assert '팀 칸' not in await P.text_content('#adminView'), '서버 팀 칸 문구가 남아 있음'
    await ctxP.close()
    print('관리 파일 통과: 오프라인(외부 요청 0건)으로 .sajin 생성, 메일 본문(비밀번호·시설 정보 없음), 이전 목록 비교, 휴대폰에서 열림')


ALLOWED = ('file:', 'data:', 'blob:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/')


def hash_of(u):
    return '#' + u.split('#', 1)[1]


async def qr_flow(b, fx):
    import json
    qr = json.loads((fx / 'qr.json').read_text(encoding='utf-8'))
    start = len(REQUESTS)
    # 1) 1장짜리 QR 주소로 앱 열기 (카메라 앱으로 찍은 경우) → 비밀번호 → 이름 → 등록, 주소에 #q= 없음
    ctx, A = await new_page(b)
    await A.goto(URL + hash_of(qr['one'][0])); await A.wait_for_selector('#passIn')
    assert '#q=' not in A.url, A.url
    await A.fill('#passIn', 'wrong-passphrase-00000'); await A.click('.keycard button:has-text("확인")')
    await A.wait_for_function("document.querySelector('.keycard .msg').textContent.includes('QR이 손상')")
    await A.fill('#passIn', PASS); await A.click('.keycard button:has-text("확인")')
    m = await msg(A, '등록했습니다'); assert '3팀 (시험권) · 2026년 99차 · 5곳을 등록했습니다' in m, m
    await A.wait_for_selector('#nameIn'); await A.fill('#nameIn', '시험자갑'); await A.click('.keycard button:has-text("확인")')
    await A.wait_for_selector('#siteList .site'); assert await A.locator('#siteList .site').count() == 5
    await A.screenshot(path=str(OUT / 'screen_qr_done.png'), full_page=True)
    # 사진 1장 (새 판에서 보존되는지)
    await A.locator('#siteList .site', has_text=qr['facility3']).locator('.site-open').click()
    await A.wait_for_selector('#editView:not([hidden])')
    async with A.expect_file_chooser() as fc: await A.locator('.add').first.click()
    await (await fc.value).set_files(str(ROOT / 'tests/fixtures/landscape.jpg'))
    await A.wait_for_selector('.ph'); await A.click('#backBtn'); await A.wait_for_selector('#siteList .site')
    # 2) 같은 QR 다시 → 이미 등록된 목록 (앱이 열린 상태에서 카메라로 다시 찍음 = 주소 # 만 바뀜)
    await A.goto(URL + hash_of(qr['one'][0]))
    assert '이미 등록된 목록입니다' in await msg(A, '이미 등록된'); assert '#q=' not in A.url
    # 3) 2장짜리 새 판: 2번 조각 → "1 / 2 받음" → 새로고침해도 유지 → 1번 조각 → 자동 갱신(사진 보존)
    await A.goto(URL + hash_of(qr['two'][1]))
    assert '1 / 2 받음' in await msg(A, '1 / 2 받음')
    await A.wait_for_selector('.qrprog'); assert '2번 받음' in await A.text_content('.qrprog')
    await A.screenshot(path=str(OUT / 'screen_qr_progress.png'))
    await A.wait_for_timeout(600); await A.reload(); await A.wait_for_selector('.qrprog')
    await A.goto(URL + hash_of(qr['two'][0]))
    m = await msg(A, '갱신했습니다'); assert '갱신 5곳, 추가 1곳' in m, m
    assert await A.locator('.qrprog').count() == 0
    assert '사진 1장' in await A.locator('#siteList .site', has_text=qr['facility3']).locator('.state').text_content(), '새 판에서 사진 유지'
    assert '변경된주소 2' in await A.text_content('#siteList')
    # 4) 옛 판 QR → 무시
    await A.goto(URL + hash_of(qr['old'][0]))
    assert '이미 더 최신 목록' in await msg(A, '이미 더 최신')
    # 5) 이 앱 형식이 아닌 #q=
    await A.goto(URL + '#q=9.2.abcd.xyz'); assert '이 앱용 QR이 아닙니다' in await msg(A, '이 앱용 QR')
    # 6) 메일 파일 방식도 그대로
    await load_file(A, fx / 'team1.sajin'); await msg(A, '1팀 (시험권)')
    assert not A.errs, A.errs
    await ctx.close()

    # 7) 평소와 다른 브라우저(삼성 인터넷)로 열림, 이 브라우저에 자료 없음 → 안내 → 「여기에 그냥 등록」
    ctxS = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent='Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36')
    S = await ctxS.new_page(); S.on('request', lambda r: REQUESTS.append(r.url)); await S.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    jszip = ROOT / 'node_modules/jszip/dist/jszip.min.js'
    await S.route('**/jszip.min.js', lambda r: r.fulfill(path=str(jszip), content_type='application/javascript'))
    await S.goto(URL + hash_of(qr['one'][0])); await S.wait_for_selector('.keycard:has-text("평소 쓰는 브라우저")')
    assert '#q=' not in S.url
    await S.click('.keycard button:has-text("여기에 그냥 등록")'); await S.wait_for_selector('#passIn')
    await ctxS.close()
    bad = [u for u in REQUESTS[start:] if not u.startswith(ALLOWED)]
    assert not bad, f'QR 처리 중 외부 요청: {bad}'
    print('QR 흐름 통과: 1장 주소 등록·주소에서 #q= 제거, 같은 QR 다시, 2장(순서 거꾸로·새로고침 후 이어 받기) 갱신·사진 유지, 옛 판 무시, 다른 형식 거부, 메일 파일 방식 유지, 다른 브라우저 안내, 외부 요청 0건')


async def qr_scan(p, fx):
    # 앱 안 「QR 찍기」: 가짜 카메라 영상(QR 그림)으로 판독 → 등록
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                                      f'--use-file-for-fake-video-capture={fx / "qr_cam.y4m"}'])
    ctx, A = await new_page(b)
    await A.goto(URL); await A.wait_for_selector('.empty')
    assert '사실관계조사' in await A.title() and '사실관계조사' in await A.text_content('h1')
    await A.click('#qrBtn'); await A.wait_for_selector('#dlg[open] video')
    await A.wait_for_selector('#passIn', timeout=20000)
    assert not await A.evaluate("document.querySelector('#dlg').open"), '다 받으면 카메라 창 닫힘'
    await A.fill('#passIn', PASS); await A.click('.keycard button:has-text("확인")')
    assert '4팀 (카메라)' in await msg(A, '등록했습니다')
    assert not A.errs, A.errs
    await ctx.close(); await b.close()
    print('앱 안 QR 찍기 통과 (가짜 카메라 영상 → jsQR 판독 → 등록)')


async def main():
    OUT.mkdir(exist_ok=True)
    fx = pathlib.Path(tempfile.mkdtemp(prefix='sajin-lists-'))
    try:
        subprocess.run(['node', str(ROOT / 'tests/make_fixture_lists.mjs'), str(fx)], check=True, capture_output=True)
        async with async_playwright() as p:
            b = await p.chromium.launch()
            await local_flow(b)
            await list_flow(b, fx)
            await admin_flow(b, fx)
            await qr_flow(b, fx)
            await b.close()
            await qr_scan(p, fx)
        bad = [u for u in REQUESTS if 'data/lists' in u or 'crypto.json' in u]
        assert not bad, f'목록을 외부에서 받는 요청이 있음: {bad}'
        print('브라우저 테스트 통과 (data/lists 요청 0건)')
    finally:
        shutil.rmtree(fx, ignore_errors=True)

asyncio.run(main())
