import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withChatStorage,collectChatFiles,supabaseChatStorage,cleanupRequest} from '../supabase/functions/whisper/storage.ts';
const bytes=Uint8Array.from({length:40},(_,i)=>i),file=Buffer.from(bytes).toString('base64url');
test('encrypted attachments upload privately and DB only receives reference; download remains authorization gated',async()=>{
 const calls=[],objects=new Map();
 const store={async put(p,b){objects.set(p,b)},async get(p){assert.ok(objects.has(p));return objects.get(p)},async remove(){}};
 const rpc=async(action,payload)=>{calls.push({action,payload});if(action==='chat_upload')return {status:201,body:{path:'opaque'}};if(action==='chat_file')return {status:200,body:{file:'@storage/opaque',iv:'iv'}};if(action==='chat_download')return {status:200,body:{ok:true}};return {status:201,body:{seq:1}}};
 const api=withChatStorage(rpc,store);assert.equal((await api('chat_send',{file,file_iv:'iv'})).status,201);
 assert.deepEqual(objects.get('opaque'),bytes);assert.equal(calls[0].payload.file,undefined);assert.equal(calls[0].payload.bytes,40);assert.match(calls[0].payload.digest,/^[a-f0-9]{64}$/);assert.equal(calls[1].payload.file,'@storage/opaque');
 assert.deepEqual((await api('chat_file',{})).body,{file,iv:'iv'});
 let accessed=false;const denied=withChatStorage(async()=>({status:403,body:{}}),{...store,get:async()=>{accessed=true;return bytes}});assert.equal((await denied('chat_file',{})).status,403);assert.equal(accessed,false);
});
test('legacy DB files still download and text messages skip storage',async()=>{
 const rpc=async()=>({status:200,body:{file,iv:'iv'}});const store=new Proxy({},{get(){throw Error('Storage must not be used')}});
 assert.deepEqual((await withChatStorage(rpc,store)('chat_file',{})).body,{file,iv:'iv'});assert.equal((await withChatStorage(rpc,store)('chat_send',{})).status,200);
});
test('denied/full upload and committed retry never write objects; upload failure never sends message',async()=>{
 for(const status of [403,410,413,429,200]){
  let uploads=0,calls=0;const api=withChatStorage(async()=>{calls++;return {status,body:{seq:4}}},{put:async()=>uploads++});assert.equal((await api('chat_send',{file})).status,status);assert.equal(uploads,0);assert.equal(calls,1);
 }
 let calls=0;const api=withChatStorage(async()=>{calls++;return {status:201,body:{path:'opaque'}}},{put:async()=>{throw Error('offline')}});await assert.rejects(api('chat_send',{file}),/offline/);assert.equal(calls,1);
});
test('GC only acknowledges successful Storage deletion; denied request cannot delete anything',async()=>{
 for(const failure of [false,true]){
  const actions=[];const rpc=async(action)=>{actions.push(action);return {status:200,body:{paths:['orphan']}}};
  const store={remove:async paths=>{assert.deepEqual(paths,['orphan']);if(failure)throw Error('offline')}};
  if(failure)await assert.rejects(collectChatFiles(rpc,store,'token'));else assert.deepEqual(await collectChatFiles(rpc,store,'token'),{status:200,body:{removed:1}});
  assert.deepEqual(actions,failure?['storage_gc_claim']:['storage_gc_claim','storage_gc_ack']);
 }
 assert.equal((await collectChatFiles(async()=>({status:403,body:{}}),{remove:async()=>assert.fail()},'wrong')).status,403);
});
test('Supabase adapter uses private service requests, bounded objects, no upsert/public URL and batch deletion',async()=>{
 const calls=[];const store=supabaseChatStorage('https://project.supabase.co','test-key',async(url,options)=>{calls.push({url,options});return new Response(bytes)});
 await store.put('random',bytes);assert.deepEqual(await store.get('random'),bytes);await store.remove(['random']);
 assert.equal(calls[0].url,'https://project.supabase.co/storage/v1/object/whisper-chat-files/random');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers['x-upsert'],undefined);assert.equal(calls[1].options.headers.Authorization,'Bearer test-key');assert.deepEqual(JSON.parse(calls[2].options.body),{prefixes:['random']});
 const oversized=supabaseChatStorage('https://project.supabase.co','key',async()=>new Response(new Uint8Array(262161)));await assert.rejects(oversized.get('random'),/Invalid/);
});

test('cron HTTP route rejects malformed/oversized tokens and failed cleanup never reports success',async()=>{
 let calls=0;const rpc=async()=>{calls++;return {status:403,body:{code:'denied'}}};
 for(const body of ['{}',JSON.stringify({token:'wrong'}),'x'.repeat(257)]){
  const r=await cleanupRequest(new Request('https://edge/storage-cleanup',{method:'POST',body}),rpc,{});assert.ok(r.status>=400);assert.equal(calls,0);
 }
 assert.equal((await cleanupRequest(new Request('https://edge/storage-cleanup'),rpc,{})).status,405);
 assert.equal((await cleanupRequest(new Request('https://edge/storage-cleanup',{method:'POST',body:JSON.stringify({token:'a'.repeat(64)})}),rpc,{})).status,403);assert.equal(calls,1);
 const failing=await cleanupRequest(new Request('https://edge/storage-cleanup',{method:'POST',body:JSON.stringify({token:'a'.repeat(64)})}),async()=>{throw Error('DB down')},{});assert.equal(failing.status,503);
});

test('download marker is recorded only after successful object retrieval; failed audit does not return file',async()=>{
 const actions=[];
 const rpc=async action=>{actions.push(action);return action==='chat_file'?{status:200,body:{file:'@storage/opaque',iv:'iv'}}:{status:429,body:{code:'rateLimit'}}};
 const store={get:async()=>{actions.push('object_get');return bytes}};
 assert.equal((await withChatStorage(rpc,store)('chat_file',{seq:1})).status,429);assert.deepEqual(actions,['chat_file','object_get','chat_download']);
 actions.length=0;await assert.rejects(withChatStorage(rpc,{get:async()=>{throw Error('Storage offline')}})('chat_file',{seq:1}));assert.deepEqual(actions,['chat_file']);
});
