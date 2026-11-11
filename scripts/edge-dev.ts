// Local bridge for the EXACT Edge handler and PostgreSQL RPC, no mocked API.
import {previewHTML} from '../supabase/functions/whisper/preview.ts';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {handler} from '../supabase/functions/whisper/handler.ts';
const origin='http://localhost:8788';
const previewHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"};
if(!process.env.TEST_DATABASE_URL)throw new Error('Use a disposable TEST_DATABASE_URL');
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
const api=handler({origin,pepper:'local-test-pepper-01234567890123456789',rpc:async(action,payload)=>(await pool.query('SELECT public.hush_api($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result});
const files=new Map(['format.js','index.html','app.js','crypto.js','style.css','rich.js','theme.js','interactions.js','i18n.js','audio.js','editor-menu.js'].map(f=>['/'+f,f]));
for(const kind of ['once','timed','gone'])files.set(`/og-${kind}.png`,`og-${kind}.png`);
files.set('/marked.js','vendor/marked.js');files.set('/purify.js','vendor/purify.js');files.set('/favicon.svg','whisper-mark.svg');
http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url!,origin).pathname;
  if(/^\/s\/[A-Za-z0-9_-]{16}$/.test(path)){
   const result=await api(new Request(origin+'/api/preview/'+path.slice(3)));
   if(![200,410].includes(result.status)){res.writeHead(503);res.end();return;}
   const html=previewHTML(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),origin,path.slice(3),result.status===200?await result.json():null);
   res.writeHead(200,{...previewHeaders,'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
  }
  if(path.startsWith('/api/')||path==='/health'){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2850000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const response=await api(new Request(origin+path,{method:req.method,headers:req.headers as Record<string,string>,body:req.method==='POST'?Buffer.concat(chunks):undefined}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path==='/'||/^\/(m|revoke)\/[^/]+$/.test(path)?'index.html':files.get(path);
  if(!file){res.writeHead(404);res.end();return;}
  const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"});res.end(await readFile(new URL('../web/'+file,import.meta.url)));
 }catch{res.writeHead(503);res.end();}
}).listen(8788,'127.0.0.1',()=>console.log('Whisper Edge test bridge ready on '+origin));
