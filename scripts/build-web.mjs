import {build} from 'esbuild';
import {mkdir,writeFile,copyFile,rm,readFile} from 'node:fs/promises';
const ref=process.env.SUPABASE_PROJECT_REF;
if(!/^[a-z]{20}$/.test(ref||''))throw new Error('Set SUPABASE_PROJECT_REF to the dedicated Whisper project reference');
const out='.vercel/output',musicBeta=process.env.INCLUDE_MUSIC_BETA==='1';
await rm(out,{recursive:true,force:true});await mkdir(`${out}/static`,{recursive:true});
const files=['format.js','index.html','app.js','crypto.js','style.css','rich.js','theme.js','interactions.js','i18n.js','audio.js','editor-menu.js'];
for(const file of files)await copyFile(`web/${file}`,`${out}/static/${file}`);
await copyFile('web/vendor/purify.js',`${out}/static/purify.js`);
await copyFile('web/vendor/marked.js',`${out}/static/marked.js`);
for(const kind of ['once','timed','gone'])await copyFile(`web/og-${kind}.png`,`${out}/static/og-${kind}.png`);
await copyFile('web/whisper-mark.svg',`${out}/static/favicon.svg`);
const upstream=`https://${ref}.supabase.co/functions/v1/whisper`;
const functionDir=`${out}/functions/share.func`;
await mkdir(functionDir,{recursive:true});
await build({entryPoints:['server/share.mjs'],outfile:`${functionDir}/share.mjs`,platform:'node',format:'esm',bundle:true});
await writeFile(`${functionDir}/index.mjs`, `import {readFile} from 'node:fs/promises';
import {shareHandler} from './share.mjs';
const root=new URL('./',import.meta.url);
const config=JSON.parse(await readFile(new URL('public-config.json',root),'utf8'));
export default shareHandler(config,await readFile(new URL('index.html',root),'utf8'));
`);
await copyFile('web/index.html',`${functionDir}/index.html`);

await writeFile(`${functionDir}/public-config.json`,JSON.stringify({api:upstream,origin:'https://whisper-nhut3110.vercel.app'}));
await writeFile(`${functionDir}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
const headers={
 'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(self), geolocation=()',
 'Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
};
const betaRoutes=[];
if(musicBeta){
 const dir=`${out}/static/music-beta`;await mkdir(dir,{recursive:true});
 for(const file of ['index.html','app.js','style.css']){
  let source=await readFile(`experiments/deezer-preview/${file}`,'utf8');
  source=source.replaceAll('/interactions.js','/music-beta/interactions.js').replaceAll('/style.css','/music-beta/style.css').replaceAll('/app.js','/music-beta/app.js').replaceAll('/api/search','/music-beta/search');
  await writeFile(`${dir}/${file}`,source);
 }
 for(const file of ['interactions.js','i18n.js'])await writeFile(`${dir}/${file}`,(await readFile(`web/${file}`,'utf8')).replaceAll("'/i18n.js'","'/music-beta/i18n.js'"));
 const fn=`${out}/functions/music-search.func`;await mkdir(fn,{recursive:true});
 await copyFile('experiments/deezer-preview/search.mjs',`${fn}/index.mjs`);
 await writeFile(`${fn}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
 const betaHeaders={...headers,'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src https://*.dzcdn.net; media-src https://*.dzcdn.net; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"};
 betaRoutes.push({src:'/music-beta',status:307,headers:{Location:'/music-beta/'}},{src:'/music-beta/(.*)',headers:betaHeaders,continue:true},{src:'/music-beta/search',dest:'/music-search'},{src:'/music-beta/',dest:'/music-beta/index.html'});
 await writeFile(`${out}/static/style.css`,(await readFile(`${out}/static/style.css`,'utf8'))+'\n.beta-entry{width:auto;text-decoration:none;font-size:11px;white-space:nowrap;padding:6px}\n');
 // Entry exists only in the explicit beta artifact. Ordinary builds stay unchanged.
 const home=`${out}/static/index.html`;
 await writeFile(home,(await readFile(home,'utf8')).replace('</nav></div></header>','<a class="icon-button beta-entry" href="/music-beta/" aria-label="Music beta" title="Music (beta)">♫ (beta)</a></nav></div></header>'));
}
await writeFile(`${out}/config.json`,JSON.stringify({version:3,routes:[
 ...betaRoutes,
 {src:musicBeta?'/(?!music-beta(?:/|$))(.*)':'/(.*)',headers,continue:true},
 {src:'/api/(.*)',dest:`${upstream}/$1`},
 {src:'/health',dest:`${upstream}/health`},
 {src:'/s/([A-Za-z0-9_-]{16})',dest:'/share?handle=$1'},
 {handle:'filesystem'},
 {src:'/m/[^/]+',dest:'/index.html'},
 {src:'/revoke/[^/]+',dest:'/index.html'},
]},null,2)+'\n');
// Only a fixed allowlist of public frontend files is ever copied, never env/DB/tests.
console.log('Built Whisper frontend and isolated share-preview function.');
