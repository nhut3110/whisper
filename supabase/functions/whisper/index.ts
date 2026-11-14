import { handler } from './handler.ts';
import type {RPC} from './handler.ts';
import {withChatStorage,supabaseChatStorage,cleanupRequest} from './storage.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const gatewaySecret=Deno.env.get('WHISPER_GATEWAY_SECRET');
if(!gatewaySecret||gatewaySecret.length<32)throw new Error('WHISPER_GATEWAY_SECRET required');
const store=supabaseChatStorage(url,key);
const rpc:RPC=async(action,payload)=>{
 const name=action.startsWith('storage_gc_')?'hush_storage_gc':action.startsWith('chat_')?'hush_chat_api':'hush_api';
 const res=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('Database unavailable');return await res.json();
};
const api=handler({
  gatewaySecret,
  origin: Deno.env.get('APP_ORIGIN')!,
  pepper: Deno.env.get('PIN_PEPPER')!,
  rpc:withChatStorage(rpc,store),
});
Deno.serve(async req=>{
 if(new URL(req.url).pathname.endsWith('/storage-cleanup')){
  return cleanupRequest(req,rpc,store);
 }
 return api(req);
});
