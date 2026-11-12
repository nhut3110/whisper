import {build} from 'esbuild';
import {musicAsset,musicAssetNames} from './music-assets.mjs';
import {mkdir,writeFile,copyFile,rm,readFile,cp} from 'node:fs/promises';
const ref=process.env.SUPABASE_PROJECT_REF;
if(!/^[a-z]{20}$/.test(ref||''))throw new Error('Set SUPABASE_PROJECT_REF to the dedicated Whisper project reference');
const out='.vercel/output',musicBeta=process.env.INCLUDE_MUSIC_BETA==='1';
await rm(out,{recursive:true,force:true});await mkdir(`${out}/static`,{recursive:true});
await (await import('vite')).build();
await cp('dist',`${out}/static`,{recursive:true});
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
await copyFile('dist/index.html',`${functionDir}/index.html`);

await writeFile(`${functionDir}/public-config.json`,JSON.stringify({api:upstream,origin:'https://whisper-nhut3110.vercel.app'}));
await writeFile(`${functionDir}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
const headers={
 'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(self), geolocation=()',
 'Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; media-src blob:; frame-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
};
const gatewayDir=`${out}/functions/gateway.func`;
await mkdir(gatewayDir,{recursive:true});
await build({entryPoints:['server/gateway.mjs'],outfile:`${gatewayDir}/gateway.mjs`,platform:'node',format:'esm',bundle:true});
await writeFile(`${gatewayDir}/index.mjs`, `import {gatewayHandler} from './gateway.mjs';
export default gatewayHandler({secret:process.env.WHISPER_GATEWAY_SECRET,origin:'https://whisper-nhut3110.vercel.app',upstream:'${upstream}'});
`);
await writeFile(`${gatewayDir}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
const betaRoutes=[];
if(musicBeta){
 const dir=`${out}/static/music-beta`;await mkdir(dir,{recursive:true});
 for(const file of musicAssetNames)await writeFile(`${dir}/${file}`,await musicAsset(file));
 const fn=`${out}/functions/music-search.func`;await mkdir(fn,{recursive:true});
 await build({entryPoints:['server/music.mjs'],outfile:`${fn}/music.mjs`,platform:'node',format:'esm',bundle:true});
 await writeFile(`${fn}/index.mjs`, `import {musicHandler} from './music.mjs';\nexport default musicHandler({secret:process.env.WHISPER_GATEWAY_SECRET,origin:'https://whisper-nhut3110.vercel.app',upstream:'${upstream}'});\n`);
 await writeFile(`${fn}/.vc-config.json`,JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
 const betaHeaders={...headers,'X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src https://*.dzcdn.net; media-src https://*.dzcdn.net; base-uri 'none'; form-action 'self'; frame-ancestors 'self'; object-src 'none'"};
 betaRoutes.push({src:'/music-beta',status:307,headers:{Location:'/music-beta/'}},{src:'/music-beta/(.*)',headers:betaHeaders,continue:true},{src:'/music-beta/search',dest:'/music-search'},{src:'/music-beta/',dest:'/music-beta/index.html'});
 for(const home of [`${out}/static/index.html`,`${functionDir}/index.html`])await writeFile(home,(await readFile(home,'utf8')).replace('</head>','<meta name="whisper-music-beta" content="1"></head>'));
}
await writeFile(`${out}/config.json`,JSON.stringify({version:3,routes:[
 ...betaRoutes,
 {src:musicBeta?'/(?!music-beta(?:/|$))(.*)':'/(.*)',headers,continue:true},
 {src:'/api/(.*)',dest:'/gateway?path=$1'},
 {src:'/health',dest:`${upstream}/health`},
 {src:'/s/([A-Za-z0-9_-]{16})',dest:'/share?handle=$1'},
 {handle:'filesystem'},
 {src:'/chat/?',dest:'/index.html'},
 {src:'/m/[^/]+',dest:'/index.html'},
 {src:'/revoke/[^/]+',dest:'/index.html'},
]},null,2)+'\n');
// Vite copies the dedicated public directory plus the explicit client asset list, never env/DB/tests.
console.log('Built Whisper frontend and isolated share-preview function.');
