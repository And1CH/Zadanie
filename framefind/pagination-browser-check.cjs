const {chromium}=require('playwright');const assert=require('node:assert/strict');
const origin=process.env.FRAMEFIND_TEST_URL||'http://127.0.0.1:3241/';
const headers={'access-control-allow-origin':'*'};
const stub=`export const env={backends:{onnx:{wasm:{}}}};export const RawImage={read:async b=>b.text()};export async function pipeline(){return async(image,labels)=>[{label:labels[0],score:0.8},{label:labels[1],score:0.1}];}`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const queries=[];
 await p.route('https://api.openverse.org/**',r=>{const u=new URL(r.request().url());queries.push(u.searchParams.get('q'));const shift=queries.length===1?0:20;return r.fulfill({headers,contentType:'application/json',body:JSON.stringify({page_count:10,results:Array.from({length:40},(_,i)=>({id:String(i+shift),title:'Man beside dog',foreign_landing_url:`https://example.org/source/${i+shift}`,url:`https://example.org/${i+shift}.jpg`,thumbnail:`https://example.org/${i+shift}.jpg`,license:'by'}))})});});
 await p.route('https://commons.wikimedia.org/**',r=>r.fulfill({headers,contentType:'application/json',body:JSON.stringify({query:{pages:Object.fromEntries(Array.from({length:40},(_,i)=>[i,{pageid:i,title:'File:Man with dog.jpg',imageinfo:[{url:`https://example.org/${i+40}.jpg`,descriptionurl:`https://example.org/commons/${i+40}`,extmetadata:{}}]}]))},continue:{gsroffset:40}})}));
 await p.route('https://example.org/**',r=>r.fulfill({headers,contentType:'image/jpeg',body:'pixels'}));
 await p.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({headers,contentType:'text/javascript',body:stub}));
 await p.goto(origin);await p.locator('#prompt').fill('an old man petting a dog');await p.locator('#submit').click();await p.waitForFunction(()=>!document.querySelector('#submit').disabled);
 assert.match(await p.locator('#search-stats').textContent(),/80 unique.*40 images visually compared.*40 waiting/);
 assert.equal(await p.locator('.asset').count(),40);
 await p.locator('#compare-more').click();await p.waitForFunction(()=>!document.querySelector('#submit').disabled);assert.equal(await p.locator('.asset').count(),80);assert.equal(queries.length,1);
 await p.locator('#search-more').click();await p.waitForFunction(()=>!document.querySelector('#submit').disabled);
 assert.equal(queries.length,2);assert.match(queries[1],/old man petting dog/);assert.match(await p.locator('#conversation').textContent(),/an old man petting a dog/);assert.equal(await p.locator('.asset').count(),80);assert.deepEqual(errors,[]);
 const failed=await browser.newPage();await failed.route('https://api.openverse.org/**',r=>r.fulfill({headers,contentType:'application/json',body:JSON.stringify({results:Array.from({length:25},(_,i)=>({id:String(i),title:'Man with dog',foreign_landing_url:`https://example.org/${i}`,url:`https://example.org/${i}.jpg`,thumbnail:`https://example.org/${i}.jpg`}))})}));
 await failed.route('https://commons.wikimedia.org/**',r=>r.fulfill({headers,contentType:'application/json',body:'{"query":{"pages":{}}}'}));await failed.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({headers,contentType:'text/javascript',body:'throw new Error("Model download blocked")'}));
 await failed.goto(origin);await failed.locator('#prompt').fill('old man petting dog');await failed.locator('#submit').click();await failed.waitForFunction(()=>!document.querySelector('#submit').disabled);
 assert.match(await failed.locator('.empty-state h3').textContent(),/Visual comparison could not start/);assert.match(await failed.locator('#status').textContent(),/Visual AI could not load: Model download blocked/);assert.match(await failed.locator('#near-matches').textContent(),/25 unverified/);await failed.locator('#near-matches').click();assert.equal(await failed.locator('.asset').count(),25);
 console.log('PASS: eighty candidates, independent comparison batches, retained description, deduplication and explicit model failure. Provider and model replies are controlled fixtures.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
