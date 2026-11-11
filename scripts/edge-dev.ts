// Local bridge for the EXACT Edge handler and PostgreSQL RPC, no mocked API.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {handler} from '../supabase/functions/whisper/handler.ts';
const origin='http://localhost:8788';
if(!process.env.TEST_DATABASE_URL)throw new Error('Use a disposable TEST_DATABASE_URL');
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
const api=handler({origin,pepper:'local-test-pepper-01234567890123456789',rpc:async(action,payload)=>(await pool.query('SELECT public.hush_api($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result});
const files=new Map(['index.html','app.js','crypto.js','style.css','rich.js','theme.js','interactions.js','i18n.js','audio.js'].map(f=>['/'+f,f]));
files.set('/purify.js','vendor/purify.js');files.set('/favicon.svg','whisper-mark.svg');
http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url!,origin).pathname;
  if(path.startsWith('/api/')||path==='/health'){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2850000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const response=await api(new Request(origin+path,{method:req.method,headers:req.headers as Record<string,string>,body:req.method==='POST'?Buffer.concat(chunks):undefined}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path==='/'||/^\/(m|revoke)\/[^/]+$/.test(path)?'index.html':files.get(path);
  if(!file){res.writeHead(404);res.end();return;}
  const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"});res.end(await readFile(new URL('../web/'+file,import.meta.url)));
 }catch{res.writeHead(503);res.end();}
}).listen(8788,'127.0.0.1',()=>console.log('Whisper Edge test bridge ready on '+origin));
