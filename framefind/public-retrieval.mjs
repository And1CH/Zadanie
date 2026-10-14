import {planSearch,rankAssets,sourceLinks} from './search-engine.mjs';
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const unique=a=>[...new Set(a)];
export function sceneQueries(plan,{visual=false}={}){
 const full=plan.terms.join(' ')||plan.phrase;
 const expanded=full.replace(/\bold (man|woman)\b/g,'elderly $1').replace(/\bpetting\b/g,'stroking');
 const subject=full.replace(/\bold (man|woman)\b/g,'senior $1');
 const short=plan.terms.length>3?plan.terms.slice(0,3).join(' '):'';
 const broad=expanded.replace(/\b(petting|stroking|patting)\b/g,' ').replace(/\s+/g,' ').trim();
 return unique(visual?[expanded,full,subject,broad]:[full,expanded,subject,short]).filter(Boolean).slice(0,visual?4:3);
}
export function normalizeOpenverse(data,type){
 if(!Array.isArray(data?.results))throw Error('Openverse returned an invalid response');
 return data.results.map(a=>({id:String(a.id),title:text(a.title)||'Untitled asset',description:a.creator?'Photo by '+a.creator:'',sceneDescription:'',type,source:'Openverse',url:a.foreign_landing_url||a.detail_url,thumbnail:a.thumbnail,download:type==='image'?a.url:undefined,previewUrl:type!=='image'?a.url:undefined,creator:a.creator,rights:[String(a.license||'').toUpperCase(),a.license_version,a.attribution].filter(Boolean).join(' · '),licenseURL:a.license_url,tags:(a.tags||[]).map(t=>t.name),provider:a.source,duration:a.duration})).filter(a=>a.url&& (type==='image'?a.thumbnail||a.download:a.previewUrl));
}
async function openverse(query,type,request,page,pageSize){
 const u=new URL(`https://api.openverse.org/v1/${type==='image'?'images':'audio'}/`);u.search=new URLSearchParams({q:query,page_size:String(pageSize),page:String(page)});const data=await request(u);const items=normalizeOpenverse(data,type);const pages=Number(data.page_count);return {items,hasMore:Number.isFinite(pages)&&pages>0?page<pages:items.length>=pageSize};
}
async function commons(query,plan,request,page,pageSize){
 const u=new URL('https://commons.wikimedia.org/w/api.php');u.search=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query+plan.excluded.map(t=>' -'+t).join(''),gsrnamespace:'6',gsrlimit:String(pageSize),gsroffset:String((page-1)*pageSize),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640'});
 const data=await request(u);if(data.error)throw Error(data.error.info||'Wikimedia rejected the search');
 const items=Object.values(data.query?.pages||{}).map(p=>{const info=p.imageinfo?.[0];if(!info)return null;const m=info.extmetadata||{};return {id:String(p.pageid),title:p.title.replace(/^File:/,'').replace(/\.[^.]+$/,''),description:text(m.ImageDescription?.value),sceneDescription:text(m.ImageDescription?.value),type:'image',source:'Wikimedia Commons',url:info.descriptionurl,download:info.url,thumbnail:info.thumburl||info.url,creator:text(m.Artist?.value),rights:text(m.LicenseShortName?.value)||'Check original source license',licenseURL:m.LicenseUrl?.value,date:text(m.DateTimeOriginal?.value)};}).filter(Boolean);return {items,hasMore:data.continue?.gsroffset!==undefined};
}
export function assetIdentity(asset){
 try{const u=new URL(asset.download||asset.previewUrl||asset.url);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/.test(key))u.searchParams.delete(key);return u.href;}catch{return asset.url;}
}
export async function retrievePublicAssets(history,type,library,request,{onProgress,signal,visual=false,page=1,pageSize=40,exhausted=[]}={}){
 if(!Number.isInteger(page)||page<1||page>50)throw Error('Search page must be between 1 and 50.');
 const plan=planSearch(history,type),statuses=[],remote=[],finished=new Set(exhausted),size=Math.max(1,Math.min(40,pageSize));
 const sources=type==='image'?[{name:'Openverse',run:q=>openverse(q,type,request,Math.floor((page-1)/sceneQueries(plan,{visual}).length)+1,size)},{name:'Wikimedia Commons',run:q=>commons(q,plan,request,Math.floor((page-1)/sceneQueries(plan,{visual}).length)+1,size)}]:[{name:'Openverse',run:q=>openverse(q,type,request,Math.floor((page-1)/sceneQueries(plan,{visual}).length)+1,size)}];
 const blocked=new Set();
 const variants=sceneQueries(plan,{visual});
 const providerPage=Math.floor((page-1)/variants.length)+1;
 const batchQueries=variants.length?[variants[(page-1)%variants.length]]:[];
 for(const query of batchQueries){
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const active=sources.filter(s=>!blocked.has(s.name)&&!finished.has(s.name+'|'+query));if(!active.length)continue;
  const replies=await Promise.allSettled(active.map(s=>s.run(query)));
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  replies.forEach((r,i)=>{const source=active[i].name;if(r.status==='fulfilled'){remote.push(...r.value.items);if(!r.value.hasMore)finished.add(source+'|'+query);statuses.push({source,status:'searched',query,page:providerPage,count:r.value.items.length,hasMore:r.value.hasMore});}else{blocked.add(source);statuses.push({source,status:'unavailable',message:r.reason.message});}});
  onProgress?.({query,results:rankAssets([...library.filter(a=>a.type===type),...remote],plan).filter(a=>!a.sceneMissing.length),statuses:[...statuses]});
  if(!visual&&rankAssets(remote,plan).filter(a=>a.coverage===1&&!a.sceneMissing.length).length>=4)break;
 }
 const ranked=rankAssets([...library.filter(a=>a.type===type),...remote],plan);
 const seen=new Set();const candidatePool=[...ranked,...remote.filter(a=>!ranked.some(r=>r.url===a.url))].filter(a=>{const key=assetIdentity(a);if(seen.has(key))return false;seen.add(key);return !!(a.thumbnail||a.download||a.previewUrl);});
 const results=ranked.filter(a=>!a.sceneMissing.length);
 const nearMatches=ranked.filter(a=>a.sceneMissing.length);
 const failures=statuses.filter(s=>s.status==='unavailable');
 const allExhausted=variants.every(q=>sources.every(s=>finished.has(s.name+'|'+q)));
 const selectedExhausted=batchQueries.every(q=>sources.every(s=>finished.has(s.name+'|'+q)));
 const complete=statuses.some(s=>s.status==='searched')||selectedExhausted||allExhausted;
 const error=!complete&&failures.length?'Search sources could not be reached. Check your connection and try again. '+failures.map(s=>s.source+': '+s.message).join(' · '):null;
 const warnings=complete?failures.map(s=>`${s.source} unavailable; results are from the other sources.`):[];
 return {query:plan.query,plan,results,nearMatches,candidatePool,pagination:{page,hasMore:complete&&!allExhausted&&page<50,exhausted:[...finished]},stats:{uniqueCandidates:candidatePool.length,providerPage,queryVariant:batchQueries[0],sourceQueries:statuses.filter(s=>s.status==='searched').length,catalogs:unique(remote.map(a=>a.provider||a.source))},statuses,error,warnings,links:sourceLinks(plan.query,type),notice:results.length?'Source descriptions support these candidates. Their visual content has not been verified.':complete?(nearMatches.length?'No candidate description supports the complete scene. Near matches are available below.':'The sources returned no matching candidates. Try a simpler description or adjust your constraints.'):'No source search completed. This is a connection failure, not proof that the asset does not exist.'};
}
