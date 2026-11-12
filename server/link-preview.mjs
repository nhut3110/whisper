import {lookup} from 'node:dns/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import ipaddr from 'ipaddr.js';
import {Parser} from 'htmlparser2';

export function publicAddress(value){try{let ip=ipaddr.parse(value);if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();return ip.range()==='unicast'}catch{return false}}
export function publicURL(value,ownOrigin){
 const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>2048||(url.port&&!['80','443'].includes(url.port))||url.hostname===new URL(ownOrigin).hostname||!url.hostname.includes('.')||/\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)||ipaddr.isValid(url.hostname.replace(/^\[|\]$/g,'')))throw Error('Unsupported URL');
 url.hash='';return url;
}
export async function downloadPublic(value,{origin,limit=300000,kind='html',resolver=lookup,redirects=0,deadline=Date.now()+7000}={}){
 const url=publicURL(value,origin);if(Date.now()>=deadline)throw Error('Preview timeout');
 const addresses=await Promise.race([resolver(url.hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('DNS timeout')),Math.min(2000,Math.max(1,deadline-Date.now())));t.unref?.()})]);
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Non-public target');
 const pinned=addresses[0];
 const result=await new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:'GET',autoSelectFamily:false,lookup:(_name,_options,callback)=>callback(null,pinned.address,pinned.family),signal:AbortSignal.timeout(Math.min(4000,Math.max(1,deadline-Date.now()))),headers:{'User-Agent':'Whisper-LinkPreview/1.0','Accept':kind==='html'?'text/html,application/xhtml+xml':'image/jpeg,image/png,image/webp','Accept-Encoding':'identity'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.destroy();resolve({redirect:res.headers.location});return}
   const type=(res.headers['content-type']||'').split(';')[0].toLowerCase();
   if(res.statusCode!==200||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'||!(kind==='html'?['text/html','application/xhtml+xml']:['image/png','image/jpeg','image/webp']).includes(type)){res.destroy();reject(Error('Unsupported response'));return}
   const chunks=[];let bytes=0;
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){res.destroy(Error('Response too large'));return}chunks.push(chunk)});res.on('error',reject);res.on('end',()=>resolve({type,bytes:Buffer.concat(chunks),url:url.href}));
  });req.on('error',reject);req.end();
 });
 if('redirect' in result){if(!result.redirect||redirects>=2)throw Error('Redirect limit');return downloadPublic(new URL(result.redirect,url).href,{origin,limit,kind,resolver,redirects:redirects+1,deadline})}
 return result;
}
export function parseMetadata(html,base){
 const meta=new Map();let title='',insideTitle=false;
 const parser=new Parser({onopentag(name,attrs){if(name==='meta'){const key=(attrs.property||attrs.name||'').toLowerCase();if(!meta.has(key)&&attrs.content)meta.set(key,attrs.content)}if(name==='title')insideTitle=true},ontext(text){if(insideTitle)title+=text},onclosetag(name){if(name==='title')insideTitle=false}},{decodeEntities:true});parser.end(html);
 const clean=(v,max)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
 let image;const rawImage=meta.get('og:image')||meta.get('twitter:image');if(rawImage)try{image=new URL(rawImage,base).href}catch{}
 return {title:clean(meta.get('og:title')||meta.get('twitter:title')||title,180),description:clean(meta.get('og:description')||meta.get('twitter:description')||meta.get('description'),280),image};
}
export function rasterDimensions(bytes,type){
 const b=bytes;
 if(type==='image/png'&&b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return [b.readUInt32BE(16),b.readUInt32BE(20)];
 if(type==='image/jpeg'&&b[0]===255&&b[1]===216){let at=2;while(at+8<b.length){if(b[at++]!==255)break;while(b[at]===255)at++;const marker=b[at++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;const size=b.readUInt16BE(at);if(size<2||at+size>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=8)return [b.readUInt16BE(at+5),b.readUInt16BE(at+3)];at+=size}}
 if(type==='image/webp'&&b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  const kind=b.toString('ascii',12,16);if(kind==='VP8X')return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(kind==='VP8 '&&b.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a])))return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  if(kind==='VP8L'&&b[20]===0x2f)return [1+((b[21]|b[22]<<8)&0x3fff),1+((b[22]>>6|b[23]<<2|b[24]<<10)&0x3fff)];
 }
 return null;
}
export async function resolveLinkPreview(value,{origin,loader=downloadPublic}={}){
 const deadline=Date.now()+7000,url=publicURL(value,origin),page=await loader(url.href,{origin,deadline});const metadata=parseMetadata(page.bytes.toString('utf8'),page.url||url.href);
 const result={title:metadata.title,description:metadata.description};
 if(metadata.image)try{
  const image=await loader(metadata.image,{origin,limit:768000,kind:'image',deadline}),b=image.bytes;
  const dimensions=rasterDimensions(b,image.type);
  if(dimensions&&dimensions.every(n=>n>0&&n<=8192)&&dimensions[0]*dimensions[1]<=8000000)result.image={type:image.type,data:b.toString('base64')};
 }catch{}
 return result;
}
