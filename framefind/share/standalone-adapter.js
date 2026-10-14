import {retrievePublicAssets} from '../public-retrieval.mjs';
import {huntAssets,parseCaptions,findMoments,selectPreview} from '../search-engine.mjs';
// The browser distribution uses the same retrieval code as the server.
const nativeFetch=window.fetch.bind(window);
let collection=[];
try{collection=JSON.parse(localStorage.getItem('framefind-library')||'[]');}catch{}
function persist(){localStorage.setItem('framefind-library',JSON.stringify(collection));}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function publicJSON(url,signal){const timed=AbortSignal.timeout(12000);const combined=signal&&AbortSignal.any?AbortSignal.any([signal,timed]):timed;const r=await nativeFetch(url,{signal:combined});if(!r.ok)throw Error('Public source returned '+r.status);return r.json();}
window.fetch=async function(input,options={}){
 const route=String(input);if(!route.startsWith('/api/'))return nativeFetch(input,options);
 try{
 const method=options.method||'GET';
 if(route==='/api/library'&&method==='GET')return json({results:collection});
 if(route==='/api/library'&&method==='POST'){
  const b=JSON.parse(options.body);if(typeof b.title!=='string'||!b.title.trim()||!['image','video','music','sound'].includes(b.type))throw Error('Enter an asset title and type.');
  const u=new URL(b.url);if(!['http:','https:'].includes(u.protocol))throw Error('Use an HTTP or HTTPS source URL.');
  for(const key of ['thumbnail','download','previewUrl'])if(b[key]&&!['http:','https:'].includes(new URL(b[key]).protocol))throw Error('Use HTTP or HTTPS media URLs.');
  const existing=collection.find(a=>a.url===u.href&&a.type===b.type);
  const a={...b,url:u.href,id:existing?.id||crypto.randomUUID(),source:'Your library',rights:b.rights||'Check the original source license',match:'Saved by you'};
  const previous=collection;collection=existing?collection.map(item=>item.id===existing.id?a:item):[...collection,a];try{persist();}catch{collection=previous;throw Error('Browser storage is unavailable or full. The asset was not saved.');}return json(a,existing?200:201);
 }
 if(route.startsWith('/api/library/')&&method==='DELETE'){collection=collection.filter(a=>a.id!==decodeURIComponent(route.slice('/api/library/'.length)));persist();return json({removed:true});}
 if(route==='/api/search'){const b=JSON.parse(options.body);const result=await (b.type==='video'?huntAssets(b.history,b.type,collection,url=>publicJSON(url,options.signal)):retrievePublicAssets(b.history,b.type,collection,url=>publicJSON(url,options.signal),{visual:!!b.visual,page:b.page??1,exhausted:Array.isArray(b.exhausted)?b.exhausted:[],signal:options.signal,onProgress:detail=>window.dispatchEvent(new CustomEvent('framefind:search-progress',{detail}))}));if(options.signal?.aborted)throw new DOMException('Search cancelled','AbortError');return json(result);}
 if(route==='/api/moments'){
  const b=JSON.parse(options.body);if(typeof b.quote!=='string'||b.quote.trim().length<3||b.quote.length>200)throw Error('Enter an exact quote between 3 and 200 characters.');
  let cues=[],captionSource=null;
  if(b.libraryId){const a=collection.find(a=>a.id===b.libraryId);if(!a)throw Error('Saved asset not found');cues=parseCaptions(a.transcript||'');captionSource='User-supplied captions';}
  else{
   if(typeof b.id!=='string'||!/^[a-zA-Z0-9_.-]{1,200}$/.test(b.id))throw Error('Choose an archive candidate or saved asset.');
   const meta=await publicJSON('https://archive.org/metadata/'+encodeURIComponent(b.id));
   const captions=(meta.files||[]).filter(f=>!f.private&&/\.(srt|vtt)$/i.test(f.name)&&Number(f.size||0)<2000000);
   const file=captions.find(f=>/english|(?:^|[._-])en(?:[._-]|$)/i.test(f.name))||captions[0];
   if(file){captionSource='https://archive.org/download/'+encodeURIComponent(b.id)+'/'+file.name.split('/').map(encodeURIComponent).join('/');const r=await nativeFetch(captionSource,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Captions could not be read from this source.');cues=parseCaptions(await r.text());}
  }
  const moments=findMoments(cues,b.quote);
  return json({moments,captionSource,cueCount:cues.length,quote:b.quote,message:!cues.length?'No readable timestamped captions are available. This does not establish whether the quote is present.':moments.length?`${moments.length} caption match(es) found. Check the video to verify the speaker and context.`:'The exact phrase was not found in the available captions.'});
 }
 if(route.startsWith('/api/preview')){
  const u=new URL(route,'https://framefind.local');const id=u.searchParams.get('id');
  const meta=await publicJSON('https://archive.org/metadata/'+encodeURIComponent(id));const f=selectPreview(meta,u.searchParams.get('type')||'video');
  if(!f)throw Error('No playable preview is available. Open the original source below.');return json({url:'https://archive.org/download/'+encodeURIComponent(id)+'/'+f.name.split('/').map(encodeURIComponent).join('/'),type:/\.(mp4|webm)$/i.test(f.name)?'video':'audio'});
 }
 return json({error:'Unsupported request'},404);
 }catch(e){if(e.name==='AbortError')throw e;return json({error:e.message},400);}
};
