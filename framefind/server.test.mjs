import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
const testData=await mkdtemp('/tmp/framefind-test-');
process.env.FRAMEFIND_DATA_DIR=testData;
const {server,refine,sourceLinks}=await import('./server.mjs');
let base;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));await rm(testData,{recursive:true,force:true});});
test('refinement retains prior context and supports an explicit reset',()=>{assert.equal(refine(['Tom Holland interview','no, an older episode']),'tom holland interview');assert.equal(refine(['Tom Holland','start over: ocean waves']),'ocean waves');});
test('source search encodes user input as query data',()=>{const links=sourceLinks('cat & dog','video');assert.equal(new URL(links[0].url).searchParams.get('search_query'),'cat & dog');});
test('app and JavaScript are served with correct content types',async()=>{const r=await fetch(base);assert.equal(r.status,200);assert.match(await r.text(),/You imagine it/);const js=await fetch(base+'/app.js');assert.match(js.headers.get('content-type'),/javascript/);});
test('invalid search does not contact a provider',async()=>{const r=await fetch(base+'/api/search',{method:'POST',body:JSON.stringify({history:[],type:'video'})});assert.equal(r.status,400);});
test('library rejects executable URLs without persisting them',async()=>{const r=await fetch(base+'/api/library',{method:'POST',body:JSON.stringify({title:'bad',type:'image',url:'javascript:alert(1)'})});assert.equal(r.status,400);});
test('image proxy refuses private and unapproved destinations',async()=>{for(const url of ['http://127.0.0.1/','https://example.com/x.jpg','https://upload.wikimedia.org:444/x.jpg']){const r=await fetch(base+'/api/image?url='+encodeURIComponent(url));assert.equal(r.status,400);}});
test('archive preview validates IDs before requesting a provider',async()=>{const r=await fetch(base+'/api/preview?id='+encodeURIComponent('../private'));assert.equal(r.status,400);});
test('public provider failures remain visible with actionable source links',async()=>{const {search}=await import('./server.mjs');const result=await search(['unlikely clip search'],'video',async()=>{throw new Error('Provider returned HTTP 403');});assert.match(result.error,/403/);assert.equal(result.links.length,2);assert.equal(result.results.length,0);});
test('caption import accepts blank optional media URL and exposes verified timestamps',async()=>{
 const post=await fetch(base+'/api/library',{method:'POST',body:JSON.stringify({title:'API caption regression',url:'https://example.com/api-caption-test',type:'video',previewUrl:'',transcript:'1\n00:01:12,500 --> 00:01:14,000\nThat was my first audition.\n'})});
 assert.equal(post.status,201);const asset=await post.json();
 try{const r=await fetch(base+'/api/moments',{method:'POST',body:JSON.stringify({libraryId:asset.id,quote:'my first audition'})});assert.equal(r.status,200);const d=await r.json();assert.equal(d.moments[0].start,72.5);assert.equal(d.captionSource,'User-supplied captions');const negative=await fetch(base+'/api/moments',{method:'POST',body:JSON.stringify({libraryId:asset.id,quote:'not present'})});assert.deepEqual((await negative.json()).moments,[]);}finally{await fetch(base+'/api/library/'+asset.id,{method:'DELETE'});}
});
