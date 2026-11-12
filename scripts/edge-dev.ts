// Local bridge for the EXACT Edge handler and PostgreSQL RPC, no mocked API.
import {previewHTML} from '../supabase/functions/whisper/preview.ts';
import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {musicHandler} from '../server/music.mjs';
import {gatewayHandler} from '../server/gateway.mjs';
import {handler} from '../supabase/functions/whisper/handler.ts';
const origin='http://localhost:8788';
const previewHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; frame-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"};
if(!process.env.TEST_DATABASE_URL)throw new Error('Use a disposable TEST_DATABASE_URL');
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
const gatewaySecret='local-gateway-test-secret-01234567890123456789';
const api=handler({origin,gatewaySecret,pepper:'local-test-pepper-01234567890123456789',rpc:async(action,payload)=>(await pool.query('SELECT public.hush_api($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result});
const gateway=gatewayHandler({origin,secret:gatewaySecret,upstream:origin+'/api',production:false,fetcher:async(url,options)=>api(new Request(url,options))});
const music=musicHandler({origin,secret:gatewaySecret,upstream:origin+'/api',production:false,fetcher:async(url,options)=>api(new Request(url,options))});
const enableBeta=(html:string)=>html.replace('</head>','<meta name="whisper-music-beta" content="1"></head>');
const publicNames=['format.js','index.html','app.js','crypto.js','style.css','rich.js','theme.js','interactions.js','i18n.js','audio.js','editor-menu.js','marked.js','purify.js','favicon.svg','og-once.png','og-timed.png','og-gone.png'];
for(const file of await readdir(new URL('../.vercel/output/static/assets/',import.meta.url)))if(/\.(js|css)$/.test(file))publicNames.push('assets/'+file);
const files=new Map(publicNames.map(f=>['/'+f,f]));
http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url!,origin).pathname;
  if(path==='/music-beta/search'){await music(req,res);return;}
  if(path.startsWith('/music-beta/')){
   const relative=path==='/music-beta/'?'index.html':path.slice('/music-beta/'.length);
   if(!['index.html','app.js','style.css','interactions.js','i18n.js'].includes(relative)){res.writeHead(404);res.end();return;}
   const config=JSON.parse(await readFile(new URL('../.vercel/output/config.json',import.meta.url),'utf8'));
   const headers=config.routes.find((r:any)=>r.src==='/music-beta/(.*)').headers;
   res.writeHead(200,{...headers,'Content-Type':relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':'text/html'});
   res.end(await readFile(new URL('../.vercel/output/static/music-beta/'+relative,import.meta.url)));return;
  }
  if(/^\/s\/[A-Za-z0-9_-]{16}$/.test(path)){
   const result=await api(new Request(origin+'/api/preview/'+path.slice(3)));
   if(![200,410].includes(result.status)){res.writeHead(503);res.end();return;}
   const html=previewHTML(enableBeta(await readFile(new URL('../.vercel/output/static/index.html',import.meta.url),'utf8')),origin,path.slice(3),result.status===200?await result.json():null);
   res.writeHead(200,{...previewHeaders,'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
  }
  if(path.startsWith('/api/')||path==='/health'){
   if(path==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;}
   await gateway(req,res);return;
  }
  const file=path==='/'||/^\/(m|revoke)\/[^/]+$/.test(path)?'index.html':files.get(path);
  if(!file){res.writeHead(404);res.end();return;}
  const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; frame-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"});res.end(file==='index.html'?enableBeta(await readFile(new URL('../.vercel/output/static/'+file,import.meta.url),'utf8')):await readFile(new URL('../.vercel/output/static/'+file,import.meta.url)));
 }catch{res.writeHead(503);res.end();}
}).listen(8788,'127.0.0.1',()=>console.log('Whisper Edge test bridge ready on '+origin));
