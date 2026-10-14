import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retrievePublicAssets,normalizeOpenverse,sceneQueries} from './public-retrieval.mjs';
import {planSearch} from './search-engine.mjs';
const photo={id:'remote-1',title:'Senior man stroking his dog',creator:'Source photographer',foreign_landing_url:'https://example.org/original',url:'https://example.org/image.jpg',thumbnail:'https://example.org/thumb.jpg',license:'by',license_version:'4.0',tags:[{name:'elderly'},{name:'man'},{name:'dog'},{name:'stroking'}]};
test('scene variants retain subject and action while expanding common wording',()=>{const q=sceneQueries(planSearch(['an old man petting a dog'],'image'));assert.equal(q[0],'old man petting dog');assert.ok(q.includes('elderly man stroking dog'));assert.ok(q.every(query=>/petting|stroking/.test(query)));});
test('keyless provider requests return ranked grounded images for the user scene',async()=>{const requests=[];const result=await retrievePublicAssets(['an old man petting a dog'],'image',[],async url=>{requests.push(String(url));return String(url).includes('openverse')?{results:[photo]}:{query:{pages:{}}};});assert.ok(requests.some(u=>u.startsWith('https://api.openverse.org/v1/images/')));assert.equal(result.results[0].url,photo.foreign_landing_url);assert.equal(result.results[0].download,photo.url);assert.deepEqual(result.results[0].sceneMissing,[]);assert.equal(result.results[0].matchLevel,'described-scene');assert.equal(result.error,null);});
test('failure of one source does not discard successful results from another',async()=>{const result=await retrievePublicAssets(['old man dog'],'image',[],async url=>{if(String(url).includes('wikimedia'))throw Error('Offline');return {results:[photo]};});assert.equal(result.error,null);assert.ok(result.results.length);assert.ok(result.warnings.length);});
test('no matches and a failed search have different outcomes',async()=>{const empty=await retrievePublicAssets(['dog'],'image',[],async url=>String(url).includes('openverse')?{results:[]}:{query:{pages:{}}});assert.equal(empty.error,null);assert.match(empty.notice,/no matching/);const failed=await retrievePublicAssets(['dog'],'image',[],async()=>{throw Error('Network blocked');});assert.match(failed.error,/could not be reached/);assert.match(failed.notice,/connection failure/);});
test('audio results include a playable file and attribution instead of fabricated music',()=>{const r=normalizeOpenverse({results:[{...photo,url:'https://example.org/audio.mp3'}]},'sound');assert.equal(r[0].previewUrl,'https://example.org/audio.mp3');assert.match(r[0].rights,/BY.*4.0/);});
test('explicit exclusions eliminate otherwise matching candidates',async()=>{const r=await retrievePublicAssets(['old man dog','without elderly'],'image',[],async url=>String(url).includes('openverse')?{results:[photo]}:{query:{pages:{}}});assert.equal(r.results.length,0);});
test('quoted image descriptions are ranked as scenes, not treated as spoken quotes',()=>{const p=planSearch(['a photo of "an old man petting a dog"'],'image');assert.deepEqual(p.terms,['old','man','petting','dog']);assert.equal(p.phrase,'');});
test('screenshot regressions cannot become scene matches through broad tags',async()=>{
 const titles=['Vintage Portrait Photo Picture of two little girls with 2 toy pet dogs','Photo strip of a man and woman with their small dog','Well-dressed elderly couple on the porch with their dog','Man Dog Graffiti'];
 const photos=titles.map((title,i)=>({...photo,id:'bad-'+i,title,foreign_landing_url:'https://example.org/bad-'+i,tags:['old','elderly','man','petting','dog','pet'].map(name=>({name}))}));
 const r=await retrievePublicAssets(['an old man petting a dog'],'image',[],async url=>String(url).includes('openverse')?{results:photos}:{query:{pages:{}}});
 assert.equal(r.results.length,0);assert.ok(r.nearMatches.length);assert.ok(r.nearMatches.every(a=>a.sceneMissing.length));assert.match(r.notice,/No candidate description supports/);
});
test('a pet dog is not evidence of a petting action',async()=>{
 const r=await retrievePublicAssets(['old man petting dog'],'image',[],async url=>String(url).includes('openverse')?{results:[{...photo,title:'Old man with his pet dog'}]}:{query:{pages:{}}});
 assert.equal(r.results.length,0);assert.ok(r.nearMatches[0].sceneMissing.some(s=>s.includes('petting the dog')));
});
test('an old photograph does not establish an elderly subject',async()=>{
 const r=await retrievePublicAssets(['old man petting dog'],'image',[],async url=>String(url).includes('openverse')?{results:[{...photo,title:'Old photograph of man petting a dog'}]}:{query:{pages:{}}});
 assert.equal(r.results.length,0);assert.ok(r.nearMatches[0].sceneMissing.includes('an elderly man'));
});

test('the requested person must be described as performing the action',async()=>{
 const r=await retrievePublicAssets(['old man petting dog'],'image',[],async url=>String(url).includes('openverse')?{results:[{...photo,title:'An elderly man watches a young woman petting a dog'}]}:{query:{pages:{}}});
 assert.equal(r.results.length,0);assert.ok(r.nearMatches[0].sceneMissing.some(s=>s.includes('petting the dog')));
});
test('passive captions can support the same requested scene',async()=>{
 const r=await retrievePublicAssets(['old man petting dog'],'image',[],async url=>String(url).includes('openverse')?{results:[{...photo,title:'A dog being petted by an elderly man'}]}:{query:{pages:{}}});
 assert.equal(r.results.length,1);assert.deepEqual(r.results[0].sceneMissing,[]);
});
