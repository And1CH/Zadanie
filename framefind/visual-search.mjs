const MODEL='Xenova/clip-vit-base-patch32';
const RUNTIME='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.web.min.js';
let modelPromise=null;
function abortable(promise,signal){if(!signal)return promise;if(signal.aborted)return Promise.reject(new DOMException('Search cancelled','AbortError'));return new Promise((resolve,reject)=>{const cancel=()=>reject(new DOMException('Search cancelled','AbortError'));signal.addEventListener('abort',cancel,{once:true});promise.then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});});}
export function visualLabels(plan){
 const desired=plan.query.replace(/\bold (man|woman)\b/g,'elderly $1');
 const alternatives=[];
 if(/\bman\b/.test(desired)){alternatives.push(desired.replace(/\bman\b/g,'woman'));alternatives.push(desired.replace(/\belderly man\b/g,'young boy'));}
 if(/\bwoman\b/.test(desired))alternatives.push(desired.replace(/\bwoman\b/g,'man'));
 if(/\b(petting|stroking|patting)\b/.test(desired)){alternatives.push(desired.replace(/\b(petting|stroking|patting)\b/g,'walking beside'));alternatives.push(desired.replace(/\b(petting|stroking|patting)\b/g,'standing next to'));}
 if(/\bdog\b/.test(desired)){alternatives.push(desired.replace(/\bdog\b/g,'cat'));alternatives.push('children holding toy dogs');alternatives.push('a graffiti mural depicting a man and a dog');}
 if(!alternatives.length)alternatives.push('an unrelated scene without the subjects in the requested description');
 return [desired,...new Set(alternatives.filter(s=>s!==desired))];
}
export function interpretVisualScores(asset,scores,labels){
 const desired=scores.find(s=>s.label===labels[0]);if(!desired||!Number.isFinite(desired.score))throw Error('The visual model returned an invalid result');
 const competitor=[...scores.filter(s=>s.label!==labels[0])].sort((a,b)=>b.score-a.score)[0];
 const wins=desired.score>(competitor?.score||0)+0.03;
 return {...asset,visualScore:desired.score,visualMargin:desired.score-(competitor?.score||0),visualAccepted:wins,visualReason:wins?'The requested scene ranked ahead of the alternative descriptions':`Closer to: ${competitor?.label||'an alternative scene'}`,match:wins?'Visual model candidate — inspect the image to confirm':'Visual model preferred a different scene',matchLevel:wins?'visual-candidate':'visual-near',sceneMissing:[],visualChecked:true};
}
async function loadModel(onProgress,signal){
 onProgress?.('Loading visual-search AI. First use downloads the model; later searches use the browser cache.');
 if(!modelPromise){modelPromise=(async()=>{
  const {pipeline,env,RawImage}=await import(RUNTIME);
  env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
  const classifier=await pipeline('zero-shot-image-classification',MODEL,{device:'wasm',dtype:'q8',progress_callback:p=>{if(signal?.aborted)return;if(p.status==='progress')onProgress?.(`Downloading visual model: ${p.file}${Number.isFinite(p.progress)?' · '+Math.round(p.progress)+'%':''}`);}});
  return {classifier,RawImage};
 })().catch(e=>{modelPromise=null;throw e;});}
 return abortable(modelPromise,signal);
}
export async function rankVisually(candidates,plan,{signal,onProgress,limit=40,loader=loadModel,readImage=defaultReadImage}={}){
 if(!candidates.length)return {results:[],nearMatches:[],failures:[],checked:0};
 const labels=visualLabels(plan);
 const runtime=await loader(onProgress,signal);
 const ranked=[],failures=[];
 const seen=new Set();const selected=candidates.filter(a=>{if(seen.has(a.url))return false;seen.add(a.url);return !!(a.thumbnail||a.download);}).slice(0,limit);
 for(let i=0;i<selected.length;i++){
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const asset=selected[i];onProgress?.(`Comparing image ${i+1} of ${selected.length} with your exact scene…`);
  try{
   const image=await readImage(asset,runtime,signal);
   const scores=await abortable(runtime.classifier(image,labels,{hypothesis_template:'A photograph of {}.'}),signal);
   ranked.push(interpretVisualScores(asset,scores,labels));
  }catch(e){if(e.name==='AbortError')throw e;failures.push({title:asset.title,error:'Image pixels could not be read or compared'});}
 }
 ranked.sort((a,b)=>b.visualMargin-a.visualMargin||b.visualScore-a.visualScore);
 return {results:ranked.filter(a=>a.visualAccepted),nearMatches:ranked.filter(a=>!a.visualAccepted),failures,checked:ranked.length};
}
async function defaultReadImage(asset,runtime,signal){
 const source=asset.thumbnail||asset.download;const u=new URL(source,location.href);
 if(!['http:','https:'].includes(u.protocol))throw Error('Unsupported image source');
 const r=await fetch(u,{signal,mode:'cors'});if(!r.ok)throw Error('Image could not be read');
 const blob=await r.blob();if(blob.size>15000000)throw Error('Image is too large');
 return runtime.RawImage.read(blob);
}
