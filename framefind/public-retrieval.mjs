import {planSearch,rankAssets,sourceLinks} from './search-engine.mjs';
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const unique=a=>[...new Set(a)];
export function sceneQueries(plan){
 const full=plan.terms.join(' ')||plan.phrase;
 const expanded=full.replace(/\bold (man|woman)\b/g,'elderly $1').replace(/\bpetting\b/g,'stroking');
 const subject=full.replace(/\b(petting|stroking|patting|holding|playing|walking|sitting|standing|smiling|beside|near|while)\b/g,' ').replace(/\s+/g,' ').trim();
 const short=plan.terms.length>3?plan.terms.slice(0,3).join(' '):'';
 return unique([full,expanded,subject,short]).filter(Boolean).slice(0,3);
}
export function normalizeOpenverse(data,type){
 if(!Array.isArray(data?.results))throw Error('Openverse returned an invalid response');
 return data.results.map(a=>({id:String(a.id),title:text(a.title)||'Untitled asset',description:[a.creator,...(a.tags||[]).map(t=>t.name)].filter(Boolean).join(' · '),type,source:'Openverse',url:a.foreign_landing_url||a.detail_url,thumbnail:a.thumbnail,download:type==='image'?a.url:undefined,previewUrl:type!=='image'?a.url:undefined,creator:a.creator,rights:[String(a.license||'').toUpperCase(),a.license_version,a.attribution].filter(Boolean).join(' · '),licenseURL:a.license_url,tags:(a.tags||[]).map(t=>t.name),provider:a.source,duration:a.duration})).filter(a=>a.url&& (type==='image'?a.thumbnail||a.download:a.previewUrl));
}
async function openverse(query,type,request){
 const u=new URL(`https://api.openverse.org/v1/${type==='image'?'images':'audio'}/`);u.search=new URLSearchParams({q:query,page_size:'20'});return normalizeOpenverse(await request(u),type);
}
async function commons(query,plan,request){
 const u=new URL('https://commons.wikimedia.org/w/api.php');u.search=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query+plan.excluded.map(t=>' -'+t).join(''),gsrnamespace:'6',gsrlimit:'16',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640'});
 const data=await request(u);if(data.error)throw Error(data.error.info||'Wikimedia rejected the search');
 return Object.values(data.query?.pages||{}).map(p=>{const info=p.imageinfo?.[0];if(!info)return null;const m=info.extmetadata||{};return {id:String(p.pageid),title:p.title.replace(/^File:/,'').replace(/\.[^.]+$/,''),description:text(m.ImageDescription?.value),type:'image',source:'Wikimedia Commons',url:info.descriptionurl,download:info.url,thumbnail:info.thumburl||info.url,creator:text(m.Artist?.value),rights:text(m.LicenseShortName?.value)||'Check original source license',licenseURL:m.LicenseUrl?.value,date:text(m.DateTimeOriginal?.value)};}).filter(Boolean);
}
export async function retrievePublicAssets(history,type,library,request,{onProgress,signal}={}){
 const plan=planSearch(history,type),statuses=[],remote=[];
 const sources=type==='image'?[{name:'Openverse',run:q=>openverse(q,type,request)},{name:'Wikimedia Commons',run:q=>commons(q,plan,request)}]:[{name:'Openverse',run:q=>openverse(q,type,request)}];
 const blocked=new Set();
 for(const query of sceneQueries(plan)){
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const active=sources.filter(s=>!blocked.has(s.name));if(!active.length)break;
  const replies=await Promise.allSettled(active.map(s=>s.run(query)));
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  replies.forEach((r,i)=>{const source=active[i].name;if(r.status==='fulfilled'){remote.push(...r.value);statuses.push({source,status:'searched',query,count:r.value.length});}else{blocked.add(source);statuses.push({source,status:'unavailable',message:r.reason.message});}});
  onProgress?.({query,results:rankAssets([...library.filter(a=>a.type===type),...remote],plan),statuses:[...statuses]});
  if(rankAssets(remote,plan).filter(a=>a.coverage===1).length>=4)break;
 }
 const results=rankAssets([...library.filter(a=>a.type===type),...remote],plan).slice(0,32);
 const failures=statuses.filter(s=>s.status==='unavailable');
 const complete=statuses.some(s=>s.status==='searched');
 const error=!complete&&failures.length?'Search sources could not be reached. Check your connection and try again. '+failures.map(s=>s.source+': '+s.message).join(' · '):null;
 const warnings=complete?failures.map(s=>`${s.source} unavailable; results are from the other sources.`):[];
 return {query:plan.query,plan,results,statuses,error,warnings,links:sourceLinks(plan.query,type),notice:results.length?'Candidates ranked by title, description, and related tags. Preview them to confirm the scene.':complete?'The sources returned no matching candidates. Try a simpler description or adjust your constraints.':'No source search completed. This is a connection failure, not proof that the asset does not exist.'};
}
