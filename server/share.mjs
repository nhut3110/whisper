import {previewHTML} from '../supabase/functions/whisper/preview.ts';
export function shareHandler(config,shell,request=fetch){return async function share(req,res){
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Robots-Tag','noindex, noarchive, nosnippet');
 const handle=new URL(req.url,config.origin).searchParams.get('handle');
 if(!/^[A-Za-z0-9_-]{16}$/.test(handle||'')||!['GET','HEAD'].includes(req.method)){res.statusCode=404;res.end();return;}
 let data;
 try{
  const response=await request(config.api+'/preview/'+handle,{signal:AbortSignal.timeout(4000),redirect:'error',cache:'no-store'});
  if(response.status===410)data=null;
  else if(response.ok){const v=await response.json();if(typeof v.burn==='boolean'&&Number.isSafeInteger(v.expires_at)&&v.expires_at>0)data={burn:v.burn,expires_at:v.expires_at};}
 }catch{/* A preview outage must not prevent the recipient from opening the app. */}
 res.end(req.method==='HEAD'?undefined:previewHTML(shell,config.origin,handle,data));
}
}
