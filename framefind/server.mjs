import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {huntAssets,planSearch,parseCaptions,findMoments,selectPreview,sourceLinks} from './search-engine.mjs';
import {retrievePublicAssets} from './public-retrieval.mjs';
import {searchStockImages} from './stock-search.mjs';
export {sourceLinks};
const run=promisify(execFile);
const root=fileURLToPath(new URL('.',import.meta.url));
const data=process.env.FRAMEFIND_DATA_DIR||path.join(root,'data');
await mkdir(data,{recursive:true});
const libraryPath=path.join(data,'library.json');
let library=[];
try {library=JSON.parse(await readFile(libraryPath,'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
export function refine(history){return planSearch(history).query;}
async function getJSON(url) {
  // curl uses the environment's existing HTTPS proxy and trusted CA bundle.
  // URLs are constructed only from fixed public provider endpoints.
  try {
    const {stdout}=await run('curl',['-fsSL','--max-time','12','--user-agent','Framefind/0.1',String(url)],{maxBuffer:4*1024*1024,timeout:14000});
    return JSON.parse(stdout);
  } catch(e){throw new Error(e.code===28?'Public search timed out':/403/.test(e.stderr||'')?'Provider returned HTTP 403':'Public source could not be reached');}
}
async function stockRequest(url){
 const key=process.env.PEXELS_API_KEY;
 if(!key)throw Error('Live stock-photo search is not connected. Add PEXELS_API_KEY in environment settings.');
 if(/[\r\n]/.test(key))throw Error('The photo-service credential is invalid.');
 return new Promise((resolve,reject)=>{
  const child=spawn('curl',['-fsSL','--max-time','15','--config','-',String(url)],{stdio:['pipe','pipe','pipe']});
  let output='',error='';const timer=setTimeout(()=>child.kill(),17000);
  child.stdin.end('header = "Authorization: '+key.replace(/[\\"]/g,'\\$&')+'"\n');
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4000000)child.kill();});child.stderr.on('data',chunk=>{error+=chunk;});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Photo-service request could not start.'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error(/401|403/.test(error)?'The photo service rejected the request. Check API access and network settings.':'The photo service could not be reached.'));try{resolve(JSON.parse(output));}catch{reject(Error('The photo service returned an invalid response.'));}});
 });
}
export async function search(history,type,request=getJSON,options={}){
 let stockError=null;
 if(type==='image'&&process.env.PEXELS_API_KEY&&request===getJSON){
  try{const stock=await searchStockImages(history,library,stockRequest);if(stock.results.length)return stock;}catch(e){stockError=e.message;}
 }
 const result=await (type==='video'?huntAssets(history,type,library,request):retrievePublicAssets(history,type,library,request,options));
 if(stockError)result.warnings=[...(result.warnings||[]),'Pexels unavailable: '+stockError];
 return result;
}

async function body(req){let s='';for await(const c of req){s+=c;if(s.length>500000)throw new Error('Request too large');}return JSON.parse(s);}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  try {
    if(req.method==='GET'&&url.pathname==='/api/image'){
      const source=new URL(url.searchParams.get('url'));
      if(source.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org','archive.org','images.pexels.com','api.openverse.org'].includes(source.hostname)||source.username||source.password||source.port)return send(400,{error:'Unsupported image source'});
      const file=path.join(data,createHash('sha256').update(source.href).digest('hex')+'.image');
      let bytes;
      try{bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;const result=await run('curl',['-fsSL','--proto','=https','--proto-redir','=https','--max-time','20','--max-filesize','15000000',source.href],{encoding:'buffer',maxBuffer:15000000,timeout:22000});bytes=result.stdout;}
      const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(1,4).toString()==='PNG'?'image/png':bytes.subarray(0,3).toString()==='GIF'?'image/gif':bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;
      if(!mime)return send(415,{error:'This image format cannot be previewed'});
      await writeFile(file,bytes);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});return res.end(bytes);
    }
    if(req.method==='GET'&&url.pathname==='/api/preview'){
      const id=url.searchParams.get('id');
      if(!id||!/^[a-zA-Z0-9_.-]{1,200}$/.test(id))return send(400,{error:'Invalid archive asset'});
      const meta=await getJSON(`https://archive.org/metadata/${encodeURIComponent(id)}`);
      const f=selectPreview(meta,url.searchParams.get('type')||'video');
      if(!f)return send(404,{error:'This source has no compatible preview. Open the original source to inspect it.'});
      return send(200,{url:`https://archive.org/download/${encodeURIComponent(id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,type:/\.(mp4|webm)$/i.test(f.name)?'video':'audio'});
    }
    if(req.method==='POST'&&url.pathname==='/api/moments'){
      const b=await body(req);
      if(typeof b.quote!=='string'||b.quote.trim().length<3||b.quote.length>200)return send(400,{error:'Enter an exact quote between 3 and 200 characters.'});
      let cues=[],captionSource=null;
      if(b.libraryId){const a=library.find(a=>a.id===b.libraryId);if(!a)return send(404,{error:'Saved asset not found'});cues=parseCaptions(a.transcript||'');captionSource='User-supplied captions';}
      else{
        if(typeof b.id!=='string'||!/^[a-zA-Z0-9_.-]{1,200}$/.test(b.id))return send(400,{error:'Choose an archive candidate or saved asset.'});
        const meta=await getJSON(`https://archive.org/metadata/${encodeURIComponent(b.id)}`);
        const captions=(meta.files||[]).filter(f=>!f.private&&/\.(vtt|srt)$/i.test(f.name)).sort((a,b)=>Number(a.size||0)-Number(b.size||0));
        if(captions.length){
          const f=captions.find(f=>/english|(?:^|[._-])en(?:[._-]|$)/i.test(f.name))||captions[0];
          const src=`https://archive.org/download/${encodeURIComponent(b.id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`;
          const {stdout}=await run('curl',['-fsSL','--max-time','15','--max-filesize','2000000',src],{maxBuffer:2000000,timeout:17000});
          cues=parseCaptions(stdout);captionSource=src;
        }
      }
      const moments=findMoments(cues,b.quote);
      return send(200,{moments,captionSource,cueCount:cues.length,quote:b.quote,message:!cues.length?'No readable timestamped captions are available. This does not establish whether the quote is present.':moments.length?`${moments.length} caption match(es) found. Check the video to verify the speaker and context.`:'The exact phrase was not found in the available captions.'});
    }
    if(req.method==='POST'&&url.pathname==='/api/search'){
      const b=await body(req);
      if(!['video','image','music','sound'].includes(b.type)||!Array.isArray(b.history)||!b.history.length||b.history.length>20||b.history.some(s=>typeof s!=='string'||s.length>1000)||!refine(b.history))return send(400,{error:'Choose an asset type and enter a search (up to 1,000 characters).'});
      return send(200,await search(b.history,b.type,getJSON,{visual:!!b.visual,page:b.page??1,exhausted:Array.isArray(b.exhausted)?b.exhausted.slice(0,32):[]}));
    }
    if(req.method==='GET'&&url.pathname==='/api/library')return send(200,{results:library});
    if(req.method==='DELETE'&&url.pathname.startsWith('/api/library/')){
      const id=decodeURIComponent(url.pathname.slice('/api/library/'.length));
      if(!library.some(a=>a.id===id))return send(404,{error:'Asset not found'});
      const next=library.filter(a=>a.id!==id);await writeFile(libraryPath,JSON.stringify(next,null,2));library=next;return send(200,{removed:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/library'){
      const b=await body(req);
      if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||!['video','image','music','sound'].includes(b.type))return send(400,{error:'A title and valid asset type are required.'});
      const u=new URL(b.url);if(!['http:','https:'].includes(u.protocol))return send(400,{error:'Use an HTTP or HTTPS source URL.'});
      const item={id:crypto.randomUUID(),title:b.title.trim(),url:u.href,type:b.type,description:String(b.description||'').slice(0,1000),source:'Your library',rights:'Check the original source license',match:'Saved by you'};
      for(const field of ['thumbnail','download'])if(typeof b[field]==='string'){const link=new URL(b[field]);if(['http:','https:'].includes(link.protocol))item[field]=link.href;}
      if(typeof b.archiveId==='string'&&/^[a-zA-Z0-9_.-]{1,200}$/.test(b.archiveId))item.archiveId=b.archiveId;
      if(typeof b.transcript==='string')item.transcript=b.transcript.slice(0,300000);
      if(typeof b.previewUrl==='string'&&b.previewUrl.trim()){const link=new URL(b.previewUrl);if(['http:','https:'].includes(link.protocol))item.previewUrl=link.href;}
      if(typeof b.creator==='string')item.creator=b.creator.slice(0,500);
      if(typeof b.date==='string')item.date=b.date.slice(0,100);
      const existing=library.find(a=>a.url===item.url&&a.type===item.type);
      if(existing){Object.assign(existing,{...item,id:existing.id});await writeFile(libraryPath,JSON.stringify(library,null,2));return send(200,existing);}
      const next=[...library,item];await writeFile(libraryPath,JSON.stringify(next,null,2));library=next;return send(201,item);
    }
    if(req.method!=='GET')return send(405,{error:'Method not allowed'});
    const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/search-engine.mjs':'../search-engine.mjs','/visual-search.mjs':'../visual-search.mjs','/public-retrieval.mjs':'../public-retrieval.mjs'};
    if(!files[url.pathname])return send(404,{error:'Not found'});
    res.writeHead(200,{'Cache-Control':'no-store','Content-Type':/\.(js|mjs)$/.test(url.pathname)?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; img-src 'self' https:; media-src 'self' https:; style-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; connect-src 'self' https:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"});
    res.end(await readFile(path.join(root,'public',files[url.pathname])));
  } catch(e){send(400,{error:e instanceof SyntaxError?'Invalid request':e.message});}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Framefind running on port '+(process.env.PORT||3000)));
export {server};
