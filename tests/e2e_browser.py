"""휴대폰 화면 크기로 앱을 띄워 사진 추가 → 메일 공유 → 파일 저장 흐름을 확인한다. (선택 테스트)
준비: pip install playwright && playwright install chromium
사용: python3 tests/e2e_browser.py
"""
import asyncio, zipfile, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 390, 'height': 844}, user_agent=UA, accept_downloads=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        jszip = ROOT / 'node_modules/jszip/dist/jszip.min.js'
        if jszip.exists():  # 인터넷 없이도 돌도록 CDN 대신 로컬 파일 사용
            await pg.route('**/jszip.min.js', lambda r: r.fulfill(path=str(jszip), content_type='application/javascript'))
        await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        await pg.add_init_script("window.__shared=null; navigator.canShare=()=>true; navigator.share=async d=>{window.__shared=d.files.map(f=>f.name)};")
        await pg.goto((ROOT / 'index.html').as_uri()); await pg.wait_for_timeout(400)
        adds = await pg.query_selector_all('.add')
        async with pg.expect_file_chooser() as fc: await adds[0].click()
        await (await fc.value).set_files([str(ROOT / 'tests/fixtures/landscape.jpg'), str(ROOT / 'tests/fixtures/portrait.jpg')])
        await pg.wait_for_timeout(1200)
        await pg.click('#mailBtn'); await pg.wait_for_timeout(1500)
        shared = await pg.evaluate('window.__shared')
        assert shared and shared[0].endswith('.hwpx'), f'메일 공유 실패: {shared}'
        async with pg.expect_download() as dl: await pg.click('#saveBtn')
        out = ROOT / 'tests/out/bundle.zip'; out.parent.mkdir(exist_ok=True)
        await (await dl.value).save_as(out)
        names = zipfile.ZipFile(out).namelist()
        assert any(n.endswith('.hwpx') for n in names) and any(n.startswith('사진/') for n in names), f'저장 파일 구성 오류: {names}'
        await pg.screenshot(path=str(ROOT / 'tests/out/screen.png'), full_page=True)
        assert not errs, errs
        print('브라우저 테스트 통과:', names)
        await b.close()

asyncio.run(main())
