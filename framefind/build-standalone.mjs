import {readFile,writeFile} from 'node:fs/promises';
const read=file=>readFile(new URL(file,import.meta.url),'utf8');
let html=await read('public/index.html');
const css=await read('public/style.css');
const engine=(await read('search-engine.mjs')).replace(/^export /gm,'');
const retrievalSource=(await read('public-retrieval.mjs')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const retrieval='const {retrievePublicAssets}=(()=>{'+retrievalSource+';return {retrievePublicAssets};})();';
const adapter=(await read('share/standalone-adapter.js')).replace(/^import .*;\n/gm,'');
let app=await read('public/app.js');
const start=app.indexOf('function imageURL(a)'),end=app.indexOf('\nfunction safe(s)',start);
app=app.slice(0,start)+"function imageURL(a){return safe(a.thumbnail||a.download);}"+app.slice(end);
html=html.replace(/<link rel="stylesheet" href="[^\"]+">/,()=>'<style>'+css+'</style>');
html=html.replace(/<script type="module" src="[^\"]+"><\/script>/,()=>'<script>\n(function(){\n'+engine+'\n'+retrieval+'\n'+adapter+'\n'+app+'\n})();</script>');
html=html.replace('href="/"','href="#"').replace('SEARCH BUILD · v0.4.1','BROWSER EDITION · v0.4.1');
await writeFile(new URL('share/Try-Framefind.html',import.meta.url),html);
console.log('Built share/Try-Framefind.html with the shared search engine.');

await writeFile(new URL('share/Framefind.html',import.meta.url),html);
