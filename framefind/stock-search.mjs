import {planSearch,rankAssets,sourceLinks} from './search-engine.mjs';
export async function searchStockImages(history,library,request){
 const plan=planSearch(history,'image');
 const query=plan.query.replace(/\bold man\b/g,'elderly man').replace(/\bold woman\b/g,'elderly woman');
 const u=new URL('https://api.pexels.com/v1/search');u.search=new URLSearchParams({query,per_page:'24'});
 const d=await request(u);if(!Array.isArray(d.photos))throw Error('The photo service returned an invalid response.');
 const photos=d.photos.map(p=>({id:String(p.id),title:p.alt||'Stock photo',description:p.alt||'',type:'image',source:'Pexels',url:p.url,thumbnail:p.src?.medium||p.src?.large,download:p.src?.original,creator:p.photographer,rights:'Pexels license — check source terms before use'}));
 const results=rankAssets([...library.filter(a=>a.type==='image'),...photos],plan);
 return {query,plan,results,statuses:[{source:'Pexels',status:'searched',query}],error:null,links:sourceLinks(query,'image'),notice:'Stock-photo candidates. Preview the image to verify the scene.'};
}
