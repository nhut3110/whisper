import search from '../experiments/deezer-preview/search.mjs';
import {identify} from './gateway.mjs';
import {signClient} from '../supabase/functions/whisper/gateway.ts';
export function musicHandler({secret,origin,upstream,fetcher=fetch,production=true,searcher=search}){
 if(!secret||secret.length<32)throw Error('WHISPER_GATEWAY_SECRET required');
 return async(req,res)=>{
  const fail=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error}));};
  if(req.method!=='GET')return fail(405,'GET only');
  const params=new URL(req.url,origin).searchParams,q=(params.get('q')||'').trim(),id=params.get('id');if(id!==null?!/^[1-9][0-9]{0,14}$/.test(id):(q.length<2||q.length>120))return fail(400,'Nhập từ 2 đến 120 ký tự.');
  const client=await identify(req,res,secret,production);if(!client)return fail(503,'Client network unavailable');
  try{
   const r=await fetcher(upstream+'/music-budget',{method:'POST',headers:{origin,'content-type':'application/json',...await signClient(secret,'POST','/music-budget',client)},body:'{}',signal:AbortSignal.timeout(8000),redirect:'error'});
   if(r.status!==200){if(r.status===429)res.setHeader('Retry-After','60');return fail(r.status===429?429:503,'Thử tìm lại sau một phút.');}
  }catch{return fail(503,'Temporarily unavailable');}
  return searcher(req,res);
 };
}
