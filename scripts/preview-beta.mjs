// Loopback-only preview of the built beta artifact. Private-message APIs are not emulated.
import http from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';import search from '../.vercel/output/functions/music-search.func/index.mjs';
const root=path.resolve('.vercel/output/static'),config=JSON.parse(await readFile('.vercel/output/config.json','utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const beta=url.pathname.startsWith('/music-beta/');
 const headers=config.routes.find(r=>r.headers?.['Content-Security-Policy']&&(beta?r.src==='/music-beta/(.*)':r.src!=='/music-beta/(.*)'))?.headers||{};
 for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
 if(url.pathname==='/music-beta/search')return search(req,res);
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const relative=url.pathname==='/'?'index.html':url.pathname==='/music-beta/'?'music-beta/index.html':decodeURIComponent(url.pathname).slice(1);
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{const bytes=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}
}).listen(8793,'127.0.0.1',()=>console.log('Built beta: http://127.0.0.1:8793/music-beta/'));
