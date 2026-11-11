import http from 'node:http';
import {createSearch} from './search.mjs';
const search=createSearch();
import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url),port=Number(process.env.MUSIC_LAB_PORT||8791);
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src https://*.dzcdn.net; media-src https://*.dzcdn.net; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(body):body);};
 if(req.method!=='GET')return send(405,{error:'GET only'});
 if(url.pathname==='/api/search'){
  const result=await search(url.searchParams.get('q'));return send(result.status,result.body);
 }
 const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/interactions.js':['../../web/interactions.js','text/javascript; charset=utf-8'],'/i18n.js':['../../web/i18n.js','text/javascript; charset=utf-8']};
 const file=files[url.pathname];if(!file)return send(404,{error:'Not found'});
 try{send(200,await readFile(new URL(file[0],root)),file[1]);}catch{send(500,{error:'Cannot load lab'});}
}).listen(port,'127.0.0.1',()=>console.log('Local music experiment: http://127.0.0.1:'+port));
