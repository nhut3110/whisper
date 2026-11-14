import {resolveLinkPreview} from './link-preview.mjs';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {mac,same,signClient} from '../supabase/functions/whisper/gateway.ts';
const cookieName='__Host-whisper-device';
const MAX_BODY=2_850_000;
export function gatewayHandler({secret,origin,upstream,fetcher=fetch,production=true,previewer=resolveLinkPreview}){
 if(!secret||secret.length<32)throw Error('WHISPER_GATEWAY_SECRET must be set (32+ characters)');
 const bursts=new Map();
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  const reply=(status,error)=>{res.statusCode=status;res.end(JSON.stringify({error}));};
  const url=new URL(req.url,origin),path=url.pathname==='/gateway'?'/api/'+(url.searchParams.get('path')||''):url.pathname;
  if(!/^\/api\/(challenges|messages(?:\/[A-Za-z0-9_-]{43}\/(?:metadata|open|revoke))?|rooms(?:\/[A-Za-z0-9_-]{43}\/(?:join|sync|send|edit|delete|react|file|leave|destroy|presence|capture|copy|preview))?)$/.test(path))return reply(404,'Not found');
  if(req.method!=='POST')return reply(405,'POST only');
  if(req.headers.origin!==origin)return reply(403,'Origin not allowed');
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(400,'JSON required');
  const chat=path.startsWith('/api/rooms'),preview=chat&&path.endsWith('/preview');
  const bodyLimit=preview?4096:chat?380000:path==='/api/messages'?MAX_BODY:4096;
  if(Number(req.headers['content-length'])>bodyLimit)return reply(413,'Request too large');
  const client=await identify(req,res,secret,production);
  if(!client)return reply(503,'Client network unavailable');
  // A cheap bounded warm-instance burst brake runs before buffering a body.
  const now=Date.now();for(const [key,value] of bursts)if(value.until<=now)bursts.delete(key);
  const bucketKey=(preview?'preview:':chat?'chat:':'')+client.network;
  const bucket=bursts.get(bucketKey)||{used:0,until:now+60000};
  if(bucket.used>=(preview?12:chat?300:60)||(!bursts.has(bucketKey)&&bursts.size>=2048)){res.setHeader('Retry-After','60');return reply(429,'Too many requests');}
  bucket.used++;bursts.set(bucketKey,bucket);
  // Only forward our own identity headers; attacker-supplied identities are discarded.
  const headers={'content-type':'application/json',origin,...await signClient(secret,req.method,path.slice(4),client)};
  let size=0;const chunks=[];
  try{
   for await(const chunk of req){size+=chunk.length;if(size>bodyLimit)return reply(413,'Request too large');chunks.push(chunk);}
   if(preview){
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply(400,'Invalid JSON')}
    if(!/^[A-Za-z0-9_-]{43}$/.test(data?.member||'')||typeof data?.url!=='string')return reply(400,'Invalid preview');
    const authPath=path.slice(4).replace(/\/preview$/,'/sync');
    const allowed=await fetcher(upstream+authPath,{method:'POST',headers:{'content-type':'application/json',origin,...await signClient(secret,'POST',authPath,client)},body:JSON.stringify({member:data.member,seen:0,typing:false}),signal:AbortSignal.timeout(5000),redirect:'error'});
    await allowed.body?.cancel();if(allowed.status!==200)return reply(403,'Room access required');
    try{const metadata=await previewer(data.url,{origin});res.statusCode=200;res.end(JSON.stringify(metadata));return}catch{return reply(422,'Preview unavailable')}
   }
   const response=await fetcher(upstream+path.slice(4),{method:'POST',headers,body:Buffer.concat(chunks),signal:AbortSignal.timeout(12000),redirect:'error'});
   if(response.headers.has('retry-after'))res.setHeader('Retry-After',response.headers.get('retry-after'));
   res.statusCode=response.status;res.end(Buffer.from(await response.arrayBuffer()));
  }catch{return reply(503,'Temporarily unavailable');}
 };
}

export async function identify(req,res,secret,production=true){
  // On Vercel this header is overwritten by the platform. Never trust arbitrary forwarded headers locally.
  const raw=production?req.headers['x-vercel-forwarded-for']:req.socket?.remoteAddress;
  const ip=typeof raw==='string'?raw.trim():'';
  if(!isIP(ip))return null;
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith((production?cookieName:'whisper-device')+'='))?.slice((production?cookieName:'whisper-device').length+1)||'';
  const [candidate,signature]=cookie.split('.');let id=candidate;
  if(!/^[a-f0-9]{64}$/.test(id||'')||!same(signature||'',await mac(secret,'cookie:v1:'+id)))id=randomBytes(32).toString('hex');
  if(id!==candidate||!signature)res.setHeader('Set-Cookie',`${production?cookieName:'whisper-device'}=${id}.${await mac(secret,'cookie:v1:'+id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${production?'; Secure':''}`);
  return {owner:await mac(secret,'owner:v1:'+id),network:await mac(secret,`network:v1:${new Date().toISOString().slice(0,10)}:${ip}`)};
}
