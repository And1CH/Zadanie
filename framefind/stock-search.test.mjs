import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchStockImages} from './stock-search.mjs';
test('user scene is sent to stock-photo search and returned source URLs stay grounded',async()=>{
 let query;
 const r=await searchStockImages(['an old man petting a dog'],[],async url=>{query=new URL(url).searchParams.get('query');return {photos:[{id:1,alt:'An old man petting a dog',url:'https://www.pexels.com/photo/1/',photographer:'Test photographer',src:{medium:'https://images.pexels.com/test.jpg',original:'https://images.pexels.com/original.jpg'}}]};});
 assert.equal(query,'elderly man petting dog');assert.equal(r.results.length,1);assert.equal(r.results[0].source,'Pexels');assert.equal(r.results[0].url,'https://www.pexels.com/photo/1/');
});
test('source rejection cannot be reported as a successful search',async()=>{await assert.rejects(searchStockImages(['old man dog'],[],async()=>{throw Error('Authentication rejected');}),/Authentication rejected/);});
