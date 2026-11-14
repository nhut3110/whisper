import type {RPC,Result} from './handler.ts';
export const CHAT_BUCKET='whisper-chat-files';
export interface ChatStorage {
 put(path:string,bytes:Uint8Array):Promise<void>;
 get(path:string):Promise<Uint8Array>;
 remove(paths:string[]):Promise<void>;
}
const prefix='@storage/';
const encode=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')};
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export function withChatStorage(rpc:RPC,store:ChatStorage):RPC{
 return async(action,payload)=>{
  if(action==='chat_send'&&typeof payload.file==='string'){
   const bytes=decode(payload.file);
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   const prepared=await rpc('chat_upload',{...payload,file:undefined,bytes:bytes.length,digest});
   if(prepared.status!==201)return prepared;
   const path=(prepared.body as {path:string}).path;
   await store.put(path,bytes);
   return rpc(action,{...payload,file:prefix+path});
  }
  let result=await rpc(action,payload);
  const body=result.body as {file?:string,iv?:string};
  if(action==='chat_file'&&result.status===200&&body.file?.startsWith(prefix)){
   // The DB has just authorized this exact message and live room. No public/signed URL.
   const bytes=await store.get(body.file.slice(prefix.length));
   result={...result,body:{file:encode(bytes),iv:body.iv}};
  }
  if(action==='chat_file'&&result.status===200&&(result.body as {file?:string}).file){
   const recorded=await rpc('chat_download',payload);
   if(recorded.status!==200)return recorded;
  }
  return result;
 };
}
export async function collectChatFiles(rpc:RPC,store:ChatStorage,token:string):Promise<Result>{
 const claimed=await rpc('storage_gc_claim',{token});
 if(claimed.status!==200)return claimed;
 const paths=(claimed.body as {paths:string[]}).paths;
 if(paths.length){await store.remove(paths);await rpc('storage_gc_ack',{token,paths});}
 return {status:200,body:{removed:paths.length}};
}
export function supabaseChatStorage(url:string,key:string,fetcher:typeof fetch=fetch):ChatStorage{
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 async function call(path:string,init:RequestInit){
  const response=await fetcher(url+'/storage/v1'+path,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Error('Private attachment storage unavailable');}
  return response;
 }
 const object=(path:string)=>'/object/'+CHAT_BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/');
 return {
  async put(path,bytes){const r=await call(object(path),{method:'POST',headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'},body:bytes as BodyInit});await r.body?.cancel()},
  async get(path){const r=await call(object(path).replace('/object/','/object/authenticated/'),{method:'GET'});if(Number(r.headers.get('content-length'))>262160){await r.body?.cancel();throw Error('Invalid stored attachment');}
   const reader=r.body!.getReader();const chunks:Uint8Array[]=[];let total=0;
   try{for(;;){const next=await reader.read();if(next.done)break;total+=next.value.length;if(total>262160)throw Error('Invalid stored attachment');chunks.push(next.value)}}finally{await reader.cancel().catch(()=>{})}
   const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
  },
  async remove(paths){const r=await call('/object/'+CHAT_BUCKET,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths})});await r.body?.cancel()},
 };
}

export async function cleanupRequest(req:Request,rpc:RPC,store:ChatStorage):Promise<Response>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 if(req.method!=='POST')return new Response('{}',{status:405,headers});
 try{
  // Bound unauthenticated cron bodies before decoding them.
  const reader=req.body?.getReader();if(!reader)throw Error();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>256)throw Error();chunks.push(next.value)}}finally{await reader.cancel().catch(()=>{})}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const token=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)).token;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return new Response('{}',{status:403,headers});
  const result=await collectChatFiles(rpc,store,token);return new Response(JSON.stringify(result.body),{status:result.status,headers});
 }catch{return new Response('{}',{status:503,headers});}
}
