"""휴대폰 화면 크기로 앱을 띄워 주요 흐름을 확인한다. (선택 테스트)
- 엑셀 불러오기 → 미리보기 → 등록 → 카드 7개, 날짜 묶음 3개
- 3번 시설물에 사진 추가 → 목록에 "사진 1장", 5번은 사진 0장 (시설물 간 사진이 섞이지 않음)
- 메일 공유·파일 저장 → 파일명에 시설물명과 엑셀 날짜(YYMMDD)
- 목록 공유 링크로 새 브라우저에서 같은 7개 등록
- 예전 버전(v2) 자료 → 시설물 1건으로 옮겨짐
준비: pip install playwright && playwright install chromium
사용: python3 tests/e2e_browser.py
"""
import asyncio, zipfile, pathlib, sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests/out'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
URL = (ROOT / 'index.html').as_uri()
REPORT = '261103_관리주체_합동점검_결과_보고서(마바아파트).hwpx'

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
KV_KEYS = """async () => { const db = await new Promise(r => { const q = indexedDB.open('sajindaeji', 1); q.onsuccess = () => r(q.result); });
  return await new Promise(r => { const q = db.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => r(q.result); }); }"""


async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent=UA, accept_downloads=True)
    pg = await ctx.new_page()
    pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
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


async def main():
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx, pg = await new_page(b)
        await pg.goto(URL); await pg.wait_for_selector('#listView:not([hidden])')
        assert await pg.locator('.empty').count() == 1, '빈 목록 안내 없음'

        # 1) 엑셀 불러오기 → 미리보기 → 등록
        async with pg.expect_file_chooser() as fc: await pg.click('#xlsBtn')
        await (await fc.value).set_files(str(ROOT / 'tests/fixtures/sample_list.xlsx'))
        await pg.wait_for_selector('#dlg[open] .ptitle')
        title = await pg.text_content('.ptitle')
        assert '7개 시설' in title, title
        assert '자차아파트: 준공일' in await pg.text_content('.warnbox'), '읽지 못한 칸 노란 표시 없음'
        await pg.screenshot(path=str(OUT / 'screen_preview.png'))
        await pg.click('#sheet button:has-text("등록")')
        await pg.wait_for_selector('.site')
        assert await pg.locator('.site').count() == 7, '카드 7개가 아님'
        days = await pg.locator('.day').all_text_contents()
        assert len(days) == 3, days
        assert await card(pg, '마바아파트').locator('.tag.alert').count() == 1, 'D등급 강조 없음'

        # 2) 3번 시설물: 기본정보 채워짐 → 사진 1장 → 목록에 "사진 1장"
        await card(pg, '마바아파트').locator('.site-open').click()
        await pg.wait_for_selector('#editView:not([hidden])')
        vals = await pg.eval_on_selector_all('#metaForm input[type=text]', 'els => els.map(e => e.value)')
        for v in ['마바아파트', '마바아파트 관리사무소', 'D (정밀진단)', '총 3명(국토안전관리원 3명)', '2026. 11. 3.', '2003.03.03']:
            assert v in vals, f'기본정보에 {v} 없음: {vals}'
        async with pg.expect_file_chooser() as fc: await pg.locator('.add').first.click()
        await (await fc.value).set_files(str(ROOT / 'tests/fixtures/landscape.jpg'))
        await pg.wait_for_selector('.ph')
        await shots(pg, 'screen_edit')

        # 메일 공유 · 파일 저장: 파일명에 3번 시설물명과 엑셀 날짜(261103)
        await pg.click('#mailBtn'); await pg.wait_for_function('window.__shared')
        shared = await pg.evaluate('window.__shared')
        assert shared[0] == REPORT, f'메일 공유 파일명 오류: {shared}'
        async with pg.expect_download() as dl: await pg.click('#saveBtn')
        out = OUT / 'bundle.zip'
        await (await dl.value).save_as(out)
        names = zipfile.ZipFile(out).namelist()
        assert REPORT in names and any(n.startswith('사진/') for n in names), f'저장 파일 구성 오류: {names}'
        await pg.click('#backBtn'); await pg.wait_for_selector('#listView:not([hidden])')
        st = await card(pg, '마바아파트').locator('.state').text_content()
        assert '사진 1장' in st and '저장함' in st, st

        # 3) 5번 시설물은 사진 0장
        await card(pg, '자차아파트').locator('.site-open').click()
        await pg.wait_for_selector('#editView:not([hidden])')
        assert await pg.locator('.ph').count() == 0, '다른 시설물 사진이 섞임'
        await pg.click('#backBtn'); await pg.wait_for_selector('#listView:not([hidden])')
        assert '사진 0장' in await card(pg, '자차아파트').locator('.state').text_content()

        # 앱을 닫았다 열어도 유지 (새로고침)
        await pg.wait_for_timeout(600); await pg.reload(); await pg.wait_for_selector('.site')
        assert '사진 1장' in await card(pg, '마바아파트').locator('.state').text_content(), '새로고침 후 진행상태 사라짐'
        await shots(pg, 'screen_list')

        # 4) 목록 공유 링크 → 새 브라우저(저장 공간 따로)에서 같은 7개 등록
        await pg.click('#shareListBtn')
        await pg.wait_for_function("document.querySelector('.linkbox') && document.querySelector('.linkbox').value.includes('#list=')")
        link = await pg.eval_on_selector('.linkbox', 'e => e.value')
        assert '?' not in link and len(link) < 6000, link[:80]
        await pg.click('#sheet button:has-text("닫기")')
        assert not pg.errs, pg.errs
        ctx2, pg2 = await new_page(b)
        await pg2.goto(link); await pg2.wait_for_selector('#dlg[open] .ptitle')
        assert '7개 시설' in await pg2.text_content('.ptitle')
        await pg2.click('#sheet button:has-text("등록")'); await pg2.wait_for_selector('.site')
        assert await pg2.locator('.site').count() == 7, '공유 링크 등록 7개 아님'
        assert '#list=' not in pg2.url, '주소의 #list= 가 지워지지 않음'
        assert await pg2.locator('.site a[href^="tel:"]').count() == 0, '연락처 기본 제외 안 됨'
        assert '사진 0장' in await card(pg2, '마바아파트').locator('.state').text_content(), '링크에 사진 정보가 들어감'
        assert not pg2.errs, pg2.errs
        await ctx2.close()

        # 5) 예전 버전(v2) 자료 옮기기
        ctx3, pg3 = await new_page(b)
        await pg3.goto(URL); await pg3.wait_for_selector('#listView:not([hidden])'); await pg3.wait_for_timeout(600)
        await pg3.evaluate(SEED_V2)
        await pg3.reload(); await pg3.wait_for_selector('#editView:not([hidden]) .ph')
        assert '예전보고서체육관' in await pg3.text_content('#hdrSub')
        assert await pg3.locator('.ph').count() == 1, '예전 사진이 옮겨지지 않음'
        assert '예전 의견' in await pg3.eval_on_selector_all('#sections textarea', 'els => els.map(e => e.value).join("|")')
        keys = await pg3.evaluate(KV_KEYS)
        assert 'appState' in keys and 'draft' not in keys, keys
        await pg3.click('#backBtn'); await pg3.wait_for_selector('.site')
        assert await pg3.locator('.site').count() == 1
        assert not pg3.errs, pg3.errs
        await ctx3.close()

        print(f'브라우저 테스트 통과: 엑셀 등록 7곳·날짜 3묶음, 시설물별 사진 분리, 파일명 {REPORT}, 공유 링크 {len(link)}자, 예전 자료 옮기기')
        await b.close()

asyncio.run(main())
