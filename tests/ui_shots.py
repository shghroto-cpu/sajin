"""화면 디자인 비교용 캡처 (지시서 5). 기능 확인은 e2e_browser.py 가 하고, 이 파일은 사진만 찍는다.
사용: python3 tests/ui_shots.py <출력폴더>            예) tests/out/before, tests/out/after
      python3 tests/ui_shots.py --compare <전> <후> <결과폴더>   → 같은 화면끼리 좌우로 붙인 compare_*.png
폭 360·390·430px × 라이트·다크 × [시작, 비밀번호, 목록, 편집, 사진 시트, 저장 직후, 설정, 미리보기] + 관리 화면 1280px
"""
import asyncio, pathlib, sys, subprocess, tempfile, shutil
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
PASS2 = 'test-only-passphrase-2222'   # 테스트용 2팀 비밀번호 (가짜)
PASS = 'test-only-passphrase-0000'
WIDTHS = [360, 390, 430]


async def snap(pg, out, name, full=False):
    for scheme in ['light', 'dark']:
        await pg.emulate_media(color_scheme=scheme); await pg.wait_for_timeout(120)
        await pg.screenshot(path=str(out / f'{name}_{pg.viewport_size["width"]}_{scheme}.png'), full_page=full)
    await pg.emulate_media(color_scheme='light')


async def phone(b, out, w, fx):
    ctx = await b.new_context(viewport={'width': w, 'height': 844}, user_agent=UA, accept_downloads=True, device_scale_factor=2)
    pg = await ctx.new_page()
    jszip = ROOT / 'node_modules/jszip/dist/jszip.min.js'
    await pg.route('**/jszip.min.js', lambda r: r.fulfill(path=str(jszip), content_type='application/javascript'))
    await pg.add_init_script("navigator.canShare=()=>true; navigator.share=async()=>{};")
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_selector('#listView:not([hidden])'); await pg.wait_for_timeout(400)
    await snap(pg, out, 'start', True)
    async with pg.expect_file_chooser() as fc: await pg.click('#listFileBtn')
    await (await fc.value).set_files(str(fx / 'team2.sajin')); await pg.wait_for_selector('#passIn')
    await snap(pg, out, 'password')
    await pg.fill('#passIn', PASS2); await pg.click('.keycard button:has-text("확인")')
    await pg.wait_for_selector('#nameIn'); await pg.fill('#nameIn', '이팀갑'); await pg.click('.keycard button:has-text("확인")')
    await pg.wait_for_selector('#siteList .site'); await pg.wait_for_timeout(300)
    await snap(pg, out, 'list', True)
    await pg.locator('#siteList .site', has_text='마바아파트').locator('.site-open').click()
    await pg.wait_for_selector('#editView:not([hidden])')
    async with pg.expect_file_chooser() as fc: await pg.locator('.add').first.click()
    await (await fc.value).set_files([str(ROOT / 'tests/fixtures/landscape.jpg')] * 3)
    await pg.wait_for_function("document.querySelectorAll('.ph').length >= 3")
    await pg.evaluate("document.querySelector('#metaBox').open = true"); await pg.wait_for_timeout(200)
    await snap(pg, out, 'edit', True)
    await pg.evaluate("document.querySelector('#metaBox').open = false")
    await pg.locator('.ph').first.click(); await pg.wait_for_selector('#dlg[open]'); await pg.wait_for_timeout(300)
    await snap(pg, out, 'photo_sheet')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await pg.evaluate("document.querySelectorAll('.ph')[1].scrollIntoView({block:'center'})")
    async with pg.expect_download(): await pg.click('#saveBtn')
    await pg.wait_for_function("document.querySelector('#msg').textContent.length > 10"); await pg.wait_for_timeout(300)
    await snap(pg, out, 'saved')
    await pg.click('#backBtn'); await pg.wait_for_selector('#siteList .site')
    await pg.click('#setBtn'); await pg.wait_for_selector('#dlg[open]'); await pg.wait_for_timeout(300)
    await snap(pg, out, 'settings')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    async with pg.expect_file_chooser() as fc: await pg.click('#listFileBtn')
    await (await fc.value).set_files(str(ROOT / 'tests/fixtures/sample_list.xlsx'))
    await pg.wait_for_selector('#dlg[open] .ptitle'); await pg.wait_for_timeout(300)
    await snap(pg, out, 'preview')
    await ctx.close()


async def admin(b, out):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    pg = await ctx.new_page()
    await pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
    await pg.goto((ROOT / 'dist/admin.html').as_uri()); await pg.wait_for_selector('#admTeam')
    await pg.fill('#admTeam', '4팀 (시험권)'); await pg.click('#admTeamOk')
    await pg.fill('#admPass', PASS); await pg.fill('#admPass2', PASS); await pg.click('#admPassOk')
    await pg.wait_for_selector('#admXlsBtn:visible')
    async with pg.expect_file_chooser() as fc: await pg.click('#admXlsBtn')
    await (await fc.value).set_files(str(ROOT / 'tests/fixtures/sample_list.xlsx'))
    await pg.wait_for_selector('.admprev .plist')
    await snap(pg, out, 'admin', True)
    await pg.click('#admQR'); await pg.wait_for_selector('#admQrView:not([hidden]) svg')
    await pg.evaluate("document.querySelector('#admQrView').scrollIntoView()")
    await snap(pg, out, 'admin_qr')
    await ctx.close()


async def shoot(out):
    from playwright.async_api import async_playwright
    out.mkdir(parents=True, exist_ok=True)
    fx = pathlib.Path(tempfile.mkdtemp(prefix='sajin-ui-'))
    try:
        subprocess.run(['node', str(ROOT / 'tests/make_fixture_lists.mjs'), str(fx)], check=True, capture_output=True)
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for w in WIDTHS: await phone(b, out, w, fx)
            await admin(b, out)
            await b.close()
    finally:
        shutil.rmtree(fx, ignore_errors=True)
    print('캡처:', out, len(list(out.glob('*.png'))), '장')


def compare(a, b, out):
    from PIL import Image, ImageDraw, ImageFont
    out.mkdir(parents=True, exist_ok=True)
    try: font = ImageFont.truetype('malgunbd.ttf', 34)
    except Exception: font = ImageFont.load_default()
    n = 0
    for fa in sorted(a.glob('*.png')):
        fb = b / fa.name
        if not fb.exists(): continue
        ia, ib = Image.open(fa).convert('RGB'), Image.open(fb).convert('RGB')
        s = 1.0 if ia.width < 1500 else 0.5
        ia = ia.resize((int(ia.width * s), int(ia.height * s))); ib = ib.resize((int(ib.width * s), int(ib.height * s)))
        gap, head = 40, 60
        im = Image.new('RGB', (ia.width + ib.width + gap, max(ia.height, ib.height) + head), '#9AA5B1')
        d = ImageDraw.Draw(im)
        d.text((10, 12), '바뀌기 전', fill='white', font=font); d.text((ia.width + gap + 10, 12), '바뀐 후', fill='white', font=font)
        im.paste(ia, (0, head)); im.paste(ib, (ia.width + gap, head))
        im.save(out / f'compare_{fa.name}'); n += 1
    print('비교 그림:', out, n, '장')


if __name__ == '__main__':
    if sys.argv[1] == '--compare': compare(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4]))
    else: asyncio.run(shoot(pathlib.Path(sys.argv[1])))
