from pathlib import Path
import json, os
import functools, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
r=Path(__file__).parent
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(SimpleHTTPRequestHandler,directory=str(r)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-crash-reporter','--disable-breakpad'])
 page=b.new_page(viewport={'width':390,'height':844})
 page.set_default_timeout(8000)
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda q:requests.append(q.url))
 page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
 assert page.locator('[data-card]').count()==6
 assert page.locator('[data-card]').evaluate_all('(els)=>els.map(e=>e.dataset.card)')==['assets','stocks','indices','signal','schedule','draft']
 page.locator('summary').click()
 assert page.locator('details').get_attribute('open') is not None
 page.screenshot(path=str(r/'home-390.png'),full_page=True)
 page.locator('[data-nav="market"]').click()
 assert page.locator('a.sb-article').count()==5
 dates=page.locator('time').all_text_contents();assert dates==sorted(dates,reverse=True)
 assert page.locator('a.sb-article').evaluate_all('(a)=>a.every(e=>e.target==="_blank"&&e.rel.includes("noopener")&&e.rel.includes("noreferrer"))')
 page.locator('#filter-toggle').click()
 for box in page.locator('[data-publisher]').all(): box.uncheck()
 page.locator('#apply').click()
 assert page.locator('a.sb-article').count()==0
 page.locator('#reset-empty').click()
 assert page.locator('a.sb-article').count()==5
 page.locator('#filter-toggle').click()
 for box in page.locator('[data-publisher]').all(): box.uncheck()
 page.locator('[data-publisher="연합뉴스"]').check()
 assert page.locator('a.sb-article').count()==5 # Draft selection must not apply early.
 page.locator('#apply').click()
 assert page.locator('a.sb-article').count()==1
 page.locator('[data-type="disclosure"]').click()
 assert page.locator('.sb-filing').count()==3
 assert page.locator('#filter-toggle').is_hidden()
 page.locator('[data-filing="1"]').click()
 assert page.locator('#filing-note-1').is_visible()
 page.locator('[data-type="news"]').click()
 assert page.locator('a.sb-article').count()==1
 page.locator('#filter-toggle').click()
 page.locator('#select-all').click()
 page.locator('#apply').click()
 page.screenshot(path=str(r/'news-390.png'),full_page=True)
 for width in [320,360,390]:
  page.set_viewport_size({'width':width,'height':844})
  for scale in ['1','2']:
   page.select_option('#text-scale',scale)
   for name in ['home','news']:
    page.locator('[data-nav="'+('home' if name=='home' else 'market')+'"]').click()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),(width,scale,name)
   if width==360 and scale=='2':page.screenshot(path=str(r/'news-360-large.png'),full_page=True)
 page.locator('[data-nav="stocks"]').click()
 assert '이번 구현' in page.locator('#status').inner_text()
 # Browser back preserves the applied publisher selection.
 page.select_option('#text-scale','1')
 page.locator('[data-nav="market"]').click()
 page.locator('#filter-toggle').click()
 for box in page.locator('[data-publisher]').all():box.uncheck()
 page.locator('[data-publisher="블로터"]').check()
 page.locator('#apply').click()
 page.locator('[data-nav="home"]').click()
 page.go_back()
 page.wait_for_selector('a.sb-article')
 assert page.locator('a.sb-article').count()==1
 assert '블로터' in page.locator('.sb-publisher').inner_text()
 for value,label in [('unconnected','미연결'),('loading','불러오는 중'),('error','실패'),('empty','조회 완료')]:
  page.select_option('#data-state',value)
  assert label in page.locator('main').inner_text()
  assert page.locator('a.sb-article').count()==0
 page.locator('#return-sample').click()
 assert page.locator('a.sb-article').count()==1
 assert not errors,errors
 assert not [x for x in requests if x.startswith(('https:','http:')) and not x.startswith(f'http://127.0.0.1:{server.server_port}/')],requests
 b.close()
print('PASS: 6 home cards; news/disclosure/filters/back/state separation; 320/360/390 at 100/200%; no runtime errors or automatic external requests')
