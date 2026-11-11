// Shared by the loopback lab and the opt-in beta build. Never proxies audio.
export function cdn(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname.endsWith('.dzcdn.net')?u.href:null;}catch{return null;}}
export function createSearch(fetcher=fetch){
 let nextSearch=0;
 return async q=>{
  q=String(q||'').trim();
  if(q.length<2||q.length>120)return {status:400,body:{error:'Nhập từ 2 đến 120 ký tự.'}};
  if(Date.now()<nextSearch)return {status:429,body:{error:'Chờ một chút rồi tìm lại nhé.'}};
  nextSearch=Date.now()+1000;
  try{
   const url=new URL('https://api.deezer.com/search');url.searchParams.set('q',q);url.searchParams.set('limit','10');
   const r=await fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/json'}});
   if(!r.ok)throw new Error('Upstream refused');
   const data=await r.json();if(data.error||!Array.isArray(data.data))throw new Error('Invalid upstream');
   return {status:200,body:{tracks:data.data.slice(0,10).filter(t=>Number.isSafeInteger(t.id)&&t.id>0).map(t=>({id:t.id,title:String(t.title||''),artist:String(t.artist?.name||''),album:String(t.album?.title||''),cover:cdn(t.album?.cover_big),preview:cdn(t.preview),url:'https://www.deezer.com/track/'+t.id}))}};
  }catch{return {status:502,body:{error:'Deezer chưa phản hồi hoặc đã giới hạn truy cập. Thử lại sau nhé.'}};}
 };
}
const search=createSearch();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'GET only'}));}
 const result=await search(new URL(req.url,'https://localhost').searchParams.get('q'));
 res.statusCode=result.status;res.end(JSON.stringify(result.body));
}
