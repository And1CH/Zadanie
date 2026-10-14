// Shared between the server and the downloadable browser edition. No model or secret required.
const stop=new Set('a an the i me my we you your it its that this those these some any please find show get need want looking look search for of with in on at to from over under about and or but actually instead no video videos image images photo photos picture pictures clip clips moment moments music song songs sound sounds effect effects something thing one just could can would like footage episode'.split(' '));
const groups=[['warm','warmer','golden','cool','cooler'],['dark','darker','bright','brighter'],['calm','gentle','quiet','intense','dramatic'],['wide','closeup','aerial','portrait']];
const normalize=s=>String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
export function words(s){return normalize(s).match(/[\p{L}\p{N}]+/gu)?.filter(w=>w.length>1&&!stop.has(w))||[];}
const unique=a=>[...new Set(a)];
const aliases={senior:'elderly',seniors:'elderly',men:'man',male:'man',males:'man',women:'woman',female:'woman',dogs:'dog',canine:'dog',stroking:'petting',patting:'petting',puppy:'dog',puppies:'dog'};
const related=w=>aliases[w]||w;
export function planSearch(history,type='video'){
 let terms=[],excluded=[],phrase='',year=null,before=null,after=null,sort='relevance';
 for(const raw of history){
  let text=raw.trim();
  if(/^(start over|new search)\b/i.test(text)){terms=[];excluded=[];phrase='';year=null;before=null;after=null;sort='relevance';text=text.replace(/^(start over|new search)[:\s]*/i,'');}
  const quote=[...text.matchAll(/["“]([^"”]{3,200})["”]/g)].map(m=>m[1]);if(quote.length&&type==='video')phrase=quote.at(-1);
  if(type!=='video')text=text.replace(/["“”]/g,'');
  const excludedHere=[];
  text=text.replace(/\b(?:without|exclude|excluding|not|no|less)\s+([a-z]+(?:-[a-z]+)?)/gi,(_,w)=>{if(!['actually','i','it','that'].includes(w.toLowerCase()))excludedHere.push(w.toLowerCase());return ' ';});
  excluded=unique([...excluded,...excludedHere]);terms=terms.filter(t=>!excluded.includes(t));
  const years=text.match(/\b(?:19|20)\d{2}\b/g);if(years){const n=Number(years.at(-1));if(/\bbefore\b/i.test(text)){before=n;year=null;}else if(/\bafter\b/i.test(text)){after=n;year=null;}else{year=n;before=null;after=null;}}
  if(/\b(older|oldest|earlier)\b/i.test(text))sort='oldest';if(/\b(newer|newest|recent|latest)\b/i.test(text))sort='newest';
  text=text.replace(/["“][^"”]+["”]/g,' ').replace(/\b(before|after)\s+(?:19|20)\d{2}\b/gi,' ').replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/\b(older|oldest|earlier|newer|newest|recent|latest|more|lighting|slightly|really|very|less|much|rather|getting|gets|said|says|saying|particular|specific)\b/gi,' ');
  const added=words(text);
  for(const group of groups){if(added.some(w=>group.includes(w)))terms=terms.filter(w=>!group.includes(w));}
  terms=unique([...terms,...added]).filter(w=>!excluded.includes(w));
 }
 const canonical={warmer:'warm',cooler:'cool',brighter:'bright',darker:'dark'};
 terms=unique(terms.map(w=>canonical[w]||w));
 const query=terms.join(' ');
 return {type,terms,excluded,phrase,year,before,after,sort,query:query||(phrase?phrase:'media'),summary:[query,phrase?`quote: “${phrase}”`:null,excluded.length?`exclude: ${excluded.join(', ')}`:null,year?`year: ${year}`:null,before?`before ${before}`:null,after?`after ${after}`:null,sort!=='relevance'?`${sort} first`:null].filter(Boolean).join(' · ')};
}
function strip(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
export function imageSceneEvidence(asset,plan){
 const caption=normalize(`${asset.title} ${asset.sceneDescription ?? asset.description ?? ''}`);
 const requested=new Set(plan.terms);
 const missing=[];
 const person=requested.has('man')?'man':requested.has('woman')?'woman':null;
 const personWords=person==='man'?'man|men|gentleman|male':person==='woman'?'woman|women|lady|female':null;
 const dog=requested.has('dog')||requested.has('puppy');
 const action=requested.has('petting')||requested.has('stroking')||requested.has('patting');
 const elderly=person&&['old','elderly','senior','aged'].some(w=>requested.has(w));
 if(person&&!new RegExp('\\b('+personWords+')\\b').test(caption))missing.push(`a ${person}`);
 if(dog&&!/\bdogs?\b|\bpupp(?:y|ies)\b|\bcanine\b/.test(caption))missing.push('a dog');
 if(elderly&&!new RegExp('\\b(old|elderly|senior|aged)\\s+(?:(?:black|white|asian|bearded)\\s+)?('+personWords+')\\b|\\b('+personWords+')\\s+(?:is|looks)\\s+(elderly|senior)\\b').test(caption))missing.push(`an elderly ${person}`);
 if(action&&dog){
  const verbs='petting|stroking|patting|pets|strokes|pats';
  const animal='dog|dogs|puppy|puppies|canine';
  let supported=false;
  if(person){
   const agePrefix=elderly?'(?:old|elderly|senior|aged)\\s+(?:(?:black|white|asian|bearded)\\s+)?':'';
   const otherActor='man|men|woman|women|girl|boy|child|children|couple';
   const active=new RegExp('\\b'+agePrefix+'(?:'+personWords+')\\b(?:(?!\\b(?:'+otherActor+')\\b).){0,80}?\\b(?:'+verbs+')\\b(?:\\s+[a-z]+){0,6}\\s+\\b(?:'+animal+')\\b');
   const passive=new RegExp('\\b(?:'+animal+')\\b\\s+(?:being\\s+)?(?:petted|stroked|patted)\\s+by\\s+(?:an?\\s+)?'+agePrefix+'(?:'+personWords+')\\b');
   supported=active.test(caption)||passive.test(caption);
  }else supported=new RegExp('\\b(?:'+verbs+')\\b(?:\\s+[a-z]+){0,6}\\s+\\b(?:'+animal+')\\b').test(caption);
  if(!supported)missing.push(person?`the ${elderly?'elderly ':''}${person} petting the dog`:'petting the dog');
 }

 if(dog&&/\b(toy|stuffed|plush)\s+(?:[a-z]+\s+){0,2}dogs?\b/.test(caption))missing.push('a real dog rather than a toy');
 return {missing,strict:plan.type==='image'&&!!person&&(!!elderly||!!action),caption};
}
export function rankAssets(assets,plan){
 const seen=new Set();
 return assets.map(a=>{
  const title=normalize(a.title);
  // Creator names and broad tags are not descriptions of the depicted scene.
  const scene=imageSceneEvidence(a,plan);
  const tokens=new Set(words(scene.caption).map(related)),tagTokens=new Set(words((a.tags||[]).join(' ')).map(related));
  const found=plan.terms.filter(w=>tokens.has(related(w)));
  const tagOnly=plan.terms.filter(w=>!found.includes(w)&&tagTokens.has(related(w)));
  const year=Number(String(a.date||a.year||'').match(/\b(?:19|20)\d{2}\b/)?.[0]||String(a.title).match(/\b(?:19|20)\d{2}\b/)?.[0]||0);
  if(plan.excluded.some(w=>tokens.has(related(w))))return null;
  if(plan.year&&year!==plan.year)return null;
  if(plan.before&&(!year||year>=plan.before))return null;
  if(plan.after&&(!year||year<=plan.after))return null;
  if(plan.terms.length&&found.length===0)return null;
  const coverage=plan.terms.length?found.length/plan.terms.length:0;
  const score=coverage*60+plan.terms.filter(w=>new Set(words(title).map(related)).has(related(w))).length*7+Math.min(4,tagOnly.length)+(a.source==='Your library'?2:0)-scene.missing.length*20;
  const describedScene=scene.strict&&!scene.missing.length;
  return {...a,year:year||null,score,coverage,sceneMissing:scene.strict?scene.missing:[],sceneSpecific:scene.strict,match:describedScene?'Source description supports the requested scene':found.length?`Caption terms: ${found.join(', ')}`:'Source candidate',matchLevel:describedScene?'described-scene':'partial',matchedTerms:found,tagOnlyTerms:tagOnly};
 }).filter(Boolean).sort((a,b)=>plan.sort==='oldest'?(a.year||9999)-(b.year||9999)||b.score-a.score:plan.sort==='newest'?(b.year||0)-(a.year||0)||b.score-a.score:b.score-a.score).filter(a=>{const key=a.url;if(seen.has(key))return false;seen.add(key);return true;});
}
export function sourceLinks(query,type){const q=encodeURIComponent(query);return(type==='image'?[['Google Images',`https://www.google.com/search?tbm=isch&q=${q}`],['Wikimedia Commons',`https://commons.wikimedia.org/w/index.php?search=${q}&title=Special:MediaSearch&type=image`]]:type==='video'?[['YouTube',`https://www.youtube.com/results?search_query=${q}`],['Internet Archive',`https://archive.org/search?query=${q}`]]:[['Freesound',`https://freesound.org/search/?q=${q}`],['Internet Archive',`https://archive.org/search?query=${q}`]]).map(([title,url])=>({title,url}));}
export async function huntAssets(history,type,library,getJSON){
 const plan=planSearch(history,type),statuses=[];
 const terms=plan.terms.length?plan.terms:words(plan.phrase);
 // First retain all meaningful terms, then broaden to the original subject if needed.
 const variants=unique([terms.join(' '),terms.slice(0,terms.length>3?3:Math.max(1,terms.length-1)).join(' ')]).filter(Boolean);
 let assets=[];
 for(const query of variants.slice(0,2)){
  const provider=type==='image'?'Wikimedia Commons':'Internet Archive';
  try{
   if(type==='image'){
    const u=new URL('https://commons.wikimedia.org/w/api.php');u.search=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query+(plan.excluded.length?' '+plan.excluded.map(w=>'-'+w).join(' '):''),gsrnamespace:'6',gsrlimit:'16',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640'});
    const d=await getJSON(u);if(d.error)throw Error(d.error.info||'Source rejected the search');
    assets.push(...Object.values(d.query?.pages||{}).map(p=>{const i=p.imageinfo?.[0],m=i?.extmetadata||{};return i?{id:String(p.pageid),title:p.title.replace(/^File:/,'').replace(/\.[^.]+$/,''),type:'image',source:provider,url:i.descriptionurl,download:i.url,thumbnail:i.thumburl||i.url,description:strip(m.ImageDescription?.value).slice(0,1200),rights:strip(m.LicenseShortName?.value)||'Check source license',creator:strip(m.Artist?.value),date:strip(m.DateTimeOriginal?.value)}:null;}).filter(Boolean));
   }else{
    const medium=type==='video'?'movies':'audio';
    const tokens=words(query).map(w=>'"'+w+'"');
    let expr=`(${tokens.join(' AND ')||'"media"'}) AND mediatype:${medium}`;
    if(plan.year)expr+=` AND year:${plan.year}`;
    if(plan.before)expr+=` AND year:[1900 TO ${plan.before-1}]`;
    if(plan.after)expr+=` AND year:[${plan.after+1} TO 2100]`;
    for(const term of plan.excluded)expr+=` AND NOT "${term}"`;
    const u=new URL('https://archive.org/advancedsearch.php');const params=new URLSearchParams({q:expr,output:'json',rows:'20'});for(const f of ['identifier','title','description','date','creator','licenseurl','subject'])params.append('fl[]',f);if(plan.sort!=='relevance')params.set('sort[]',`date ${plan.sort==='oldest'?'asc':'desc'}`);u.search=params;
    const d=await getJSON(u);if(!d.response?.docs)throw Error('Source returned an invalid response');
    assets.push(...d.response.docs.map(a=>({id:a.identifier,archiveId:a.identifier,title:String(a.title||a.identifier),type,source:provider,url:`https://archive.org/details/${encodeURIComponent(a.identifier)}`,thumbnail:`https://archive.org/services/img/${encodeURIComponent(a.identifier)}`,description:strip(a.description).slice(0,1200),date:a.date,creator:strip(a.creator),rights:a.licenseurl?String(a.licenseurl):'Check source license before use',tags:Array.isArray(a.subject)?a.subject:[]})));
   }
   statuses.push({source:provider,status:'searched',query});
  }catch(e){statuses.push({source:provider,status:'unavailable',message:e.message});break;}
  if(rankAssets(assets,plan).filter(a=>a.coverage>=.75).length>=6)break;
 }
 const results=rankAssets([...library.filter(a=>a.type===type),...assets],plan).slice(0,24);
 const failures=statuses.filter(s=>s.status==='unavailable');
 return {query:plan.query,plan,results,statuses,error:failures.length?failures.map(s=>s.source+': '+s.message).join('. '):null,links:sourceLinks([plan.query,plan.phrase?`"${plan.phrase}"`:'',plan.year||''].filter(Boolean).join(' '),type),notice:plan.phrase?'Quotes require transcript evidence. Open “Find quote” on a candidate to check its captions.':'Matches are based on source text. Inspect the asset to confirm the visual or audio fit.'};
}
function seconds(t){const p=t.replace(',','.').split(':').map(Number);return p.reduce((n,v)=>n*60+v,0);}
export function parseCaptions(text){
 const lines=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');const cues=[];
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})/);
  if(!m)continue;const start=seconds(m[1]),end=seconds(m[2]);const content=[];while(++i<lines.length&&lines[i].trim())content.push(lines[i]);
  if(Number.isFinite(start)&&end>start)cues.push({start,end,text:strip(content.join(' '))});
 }
 return cues;
}
export function findMoments(cues,quote){
 const target=normalize(quote).replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(!target||target.length<3)return [];
 const matches=[];
 for(let i=0;i<cues.length;i++){
  let text='',end=cues[i].end;
  for(let j=i;j<Math.min(i+5,cues.length);j++){
   if(j>i&&cues[j].start-end>3)break;
   text+=' '+cues[j].text;end=cues[j].end;
   if((' '+normalize(text).replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ').includes(' '+target+' ')){
    if(!matches.some(m=>cues[i].start<m.end&&end>m.start))matches.push({start:cues[i].start,end,text:text.trim(),evidence:'Exact phrase found in captions'});break;
   }
  }
 }
 return matches.slice(0,12);
}
export function selectPreview(meta,type){const all=(meta.files||[]).filter(f=>!f.private&&/\.(mp4|webm|mp3|ogg|wav)$/i.test(f.name));const matching=all.filter(f=>(type==='video'?/\.(mp4|webm)$/i:/\.(mp3|ogg|wav)$/i).test(f.name));return (matching.length?matching:all).sort((a,b)=>Number(a.size||Infinity)-Number(b.size||Infinity))[0]||null;}
