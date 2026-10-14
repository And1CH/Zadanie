const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const captions='1\n00:01:12,500 --> 00:01:14,000\nThat was my\n\n2\n00:01:14,000 --> 00:01:16,000\nfirst audition.\n';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const url of ['http://127.0.0.1:3000','http://127.0.0.1:3231/Try-Framefind.html']){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#submit').disabled,{timeout:30000});
  assert.ok(await page.locator('#search-understanding').textContent());
  await page.locator('#add').click();await page.locator('[name=title]').fill('Caption regression fixture interview');await page.locator('[name=url]').fill('https://example.com/framefind-caption-regression');await page.locator('[name=type]').selectOption('video');await page.locator('[name=description]').fill('A caption test, not a discovered internet clip');await page.locator('[name=transcript]').fill(captions);await page.locator('#asset-form').getByRole('button',{name:'Save asset'}).click();await page.getByRole('heading',{name:'Caption regression fixture interview',exact:true}).waitFor();
  await page.locator('[data-quote]').click();await page.locator('#quote-input').fill('my first audition');await page.locator('#quote-form').getByRole('button',{name:'Find quote'}).click();await page.locator('.quote-match').waitFor();assert.match(await page.locator('.quote-match').textContent(),/1:12/);assert.match(await page.locator('.quote-match').textContent(),/first audition/);
  await page.locator('#quote-input').fill('words that were never spoken');await page.locator('#quote-form').getByRole('button',{name:'Find quote'}).click();await page.waitForFunction(()=>document.querySelector('#quote-status').textContent.includes('not found'));assert.equal(await page.locator('.quote-match').count(),0);
  await page.locator('#close-preview').click();await page.reload();await page.waitForFunction(()=>!document.querySelector('#submit').disabled,{timeout:30000});await page.locator('#library').click();await page.getByRole('heading',{name:'Caption regression fixture interview',exact:true}).waitFor();
  await page.locator('#discover').click();await page.waitForFunction(()=>!document.querySelector('#submit').disabled,{timeout:30000});await page.locator('[data-type=video]').click();await page.waitForFunction(()=>!document.querySelector('#submit').disabled,{timeout:30000});await page.locator('#prompt').fill('Please find a video of the caption regression fixture interview');await page.locator('#search').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.querySelector('#submit').disabled,{timeout:30000});assert.ok((await page.locator('#search-understanding').textContent()).includes('caption regression fixture interview'));await page.getByRole('heading',{name:'Caption regression fixture interview',exact:true}).waitFor();
  await page.locator('#prompt').fill('an older episode');await page.locator('#search').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.querySelector('#submit').disabled,{timeout:30000});assert.match(await page.locator('#search-understanding').textContent(),/oldest first/);assert.equal(await page.locator('.message').count(),2);
  await page.locator('#library').click();await page.getByRole('heading',{name:'Caption regression fixture interview',exact:true}).waitFor();await page.locator('[data-remove]').click();await page.waitForFunction(()=>document.querySelector('#count').textContent==='0');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log('PASS',url.includes('3231')?'downloadable edition':'server edition',': add captions, real API matching at 1:12.5, absent quote, persistence, request parsing, refinement, removal, mobile, no JS errors');
  await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
