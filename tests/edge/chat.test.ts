import {test,before,beforeEach,after} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import pg from 'pg';
import {handler} from '../../supabase/functions/whisper/handler.ts';import {signClient} from '../../supabase/functions/whisper/gateway.ts';import {randomToken} from '../../web/crypto.js';
const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('Disposable TEST_DATABASE_URL required');
const pool=new pg.Pool({connectionString:url,max:15});const origin='http://localhost:8788',secret='chat-test-gateway-secret-01234567890123456789';
const api=handler({origin,gatewaySecret:secret,pepper:'test-only-chat-pepper-01234567890123456789',rpc:async(action,payload)=>(await pool.query('SELECT public.'+(action.startsWith('chat_')?'hush_chat_api':'hush_api')+'($1,$2::jsonb) AS r',[action,JSON.stringify(payload)])).rows[0].r});
const identity={owner:'a'.repeat(64),network:'b'.repeat(64)};const boxes={ciphertext:'a'.repeat(40),iv:'a'.repeat(16)};
async function post(path:string,value:unknown,client=identity){const route='/rooms'+path;const res=await api(new Request(origin+'/api'+route,{method:'POST',headers:{origin,'content-type':'application/json',...await signClient(secret,'POST',route,client)},body:JSON.stringify(value)}));return {status:res.status,body:await res.json()};}
async function room(options:Record<string,unknown>={}){const v={id:randomToken(),access:randomToken(),member:randomToken(),name:'Host',ttl:86400,max_members:4,max_messages:10,mode:'total',keep:3,...options};const r=await post('',v);assert.equal(r.status,201,JSON.stringify(r));return v;}
const sync=(r:{id:string,member:string})=>post(`/${r.id}/sync`,{member:r.member,seen:0,typing:false});
const send=(r:{id:string,member:string},options:Record<string,unknown>={})=>post(`/${r.id}/send`,{member:r.member,...boxes,nonce:crypto.randomUUID().replaceAll('-',''),...options});
before(async()=>{
 await pool.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$");
 await pool.query('DROP TABLE IF EXISTS public.whisper_emoji_catalog,public.whisper_reactions,public.whisper_chat_messages,public.whisper_members,public.whisper_rooms CASCADE; DROP FUNCTION IF EXISTS public.hush_chat_api(text,jsonb); DROP FUNCTION IF EXISTS public.hush_api(text,jsonb),public.hush_api_core(text,jsonb),public.hush_take_budget(text,integer,integer); DROP TABLE IF EXISTS public.hush_challenges,public.hush_budgets,public.hush_messages,public.hush_abuse_budgets CASCADE');
 for(const name of ['202611110001_messages.sql','202611110002_restrict_access.sql','202611110004_edge_api.sql','202611110005_safe_previews.sql','202611120001_abuse_limits.sql','202611120002_chat_rooms.sql','202611120003_emoji_catalog.sql',...(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(name=>/_emoji_pack_/.test(name)).sort()]){
  let sql=await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');sql=sql.split('-- Keep existing independent')[0].split('-- No reads after expires_at')[0];await pool.query(sql);
 }
});
beforeEach(()=>pool.query('TRUNCATE public.whisper_rooms,public.hush_abuse_budgets CASCADE'));
after(()=>pool.end());
test('room requires signed gateway; TTL mandatory and <=48h; invalid options rejected',async()=>{
 const v={id:randomToken(),member:randomToken(),access:randomToken(),name:'Host',ttl:86400,max_members:4,max_messages:10,mode:'total',keep:3};
 for(const options of [{ttl:172801},{ttl:0},{ttl:undefined},{max_members:13},{keep:201},{mode:'forever'}])assert.equal((await post('',{...v,...options})).status,400);
 const res=await api(new Request(origin+'/api/rooms',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(v)}));assert.equal(res.status,403);
 assert.equal((await post('',v)).status,201);const row=(await pool.query('SELECT * FROM whisper_rooms')).rows[0];assert.notEqual(row.access_hash,v.access);assert.equal(row.access_hash.length,64);assert.ok(new Date(row.expires_at).getTime()-Date.now()<=86400000);
});
test('concurrent joins cannot exceed room seats; returning members can rejoin a full room',async()=>{
 const r=await room({max_members:2});const members=Array.from({length:4},()=>randomToken());const all=await Promise.all(members.map(member=>post(`/${r.id}/join`,{member,access:r.access,name:'Guest'})));assert.equal(all.filter(x=>x.status===200).length,1);assert.equal(all.filter(x=>x.body.code==='roomFull').length,3);
 const member=members[all.findIndex(x=>x.status===200)];assert.equal((await post(`/${r.id}/join`,{member,access:r.access,name:'Return'})).status,200);
 assert.equal((await post(`/${r.id}/join`,{member:randomToken(),access:randomToken(),name:'Intruder'})).status,403);
});
test('concurrent sends stop exactly at cap and duplicate nonce is idempotent',async()=>{
 const r=await room();const results=await Promise.all(Array.from({length:12},()=>send(r)));assert.equal(results.filter(v=>v.status===201).length,10);assert.equal(results.filter(v=>v.body.code==='messageLimit').length,2);const s=await sync(r);assert.equal(s.body.sent,10);assert.equal(s.body.messages.length,10);
});
test('rolling deletion removes old messages files and reactions and never resurrects a deleted message',async()=>{
 const r=await room({mode:'rolling',keep:2});const nonce='a'.repeat(32);assert.equal((await send(r,{nonce,file:'b'.repeat(40),file_iv:'c'.repeat(16)})).status,201);assert.equal((await send(r,{nonce})).body.seq,1);
 await post(`/${r.id}/react`,{member:r.member,seq:1,emoji:'❤️'});await send(r);await send(r);const s=await sync(r);assert.deepEqual(s.body.messages.map((m:{seq:number})=>m.seq),[2,3]);assert.equal((await pool.query('SELECT * FROM whisper_reactions')).rowCount,0);assert.equal((await post(`/${r.id}/file`,{member:r.member,seq:1})).status,404);
});
test('membership and ownership gate sync edit delete reactions and room destruction; receipts and typing sync',async()=>{
 const r=await room();const member=randomToken();await post(`/${r.id}/join`,{member,access:r.access,name:'Guest'});await send(r);
 assert.equal((await sync({...r,member:randomToken()})).status,403);
 assert.equal((await post(`/${r.id}/edit`,{member,seq:1,...boxes})).status,403);assert.equal((await post(`/${r.id}/delete`,{member,seq:1})).status,403);assert.equal((await post(`/${r.id}/destroy`,{member})).status,403);
 await post(`/${r.id}/sync`,{member,seen:999,typing:true});const s=await sync(r);const guest=s.body.members.find((p:{name:string})=>p.name==='Guest');assert.equal(guest.seen,1);assert.equal(guest.typing,true);assert.equal(JSON.stringify(s.body).includes('member_hash'),false);
 await post(`/${r.id}/react`,{member,seq:1,emoji:'👍'});assert.equal((await sync(r)).body.messages[0].reactions.length,1);await post(`/${r.id}/react`,{member,seq:1,emoji:'👍'});assert.equal((await sync(r)).body.messages[0].reactions.length,0);
 assert.equal((await post(`/${r.id}/edit`,{member:r.member,seq:1,...boxes})).status,200);assert.equal((await sync(r)).body.messages[0].edited,true);await post(`/${r.id}/delete`,{member:r.member,seq:1});assert.equal((await sync(r)).body.messages.length,0);
});
test('files are encrypted and excluded from sync; storage is bounded; leaving frees a seat',async()=>{
 const r=await room({max_members:2,mode:'rolling',keep:20});const member=randomToken();await post(`/${r.id}/join`,{member,access:r.access,name:'Guest'});
 await send(r,{file:'b'.repeat(100),file_iv:'c'.repeat(16)});const s=await sync(r);assert.equal(s.body.messages[0].file,undefined);const f=await post(`/${r.id}/file`,{member,seq:1});assert.equal(f.body.file,'b'.repeat(100));
 assert.equal((await send(r,{file:'b'.repeat(350001),file_iv:'c'.repeat(16)})).status,400);
 await post(`/${r.id}/leave`,{member});assert.equal((await sync({...r,member})).status,403);assert.equal((await post(`/${r.id}/join`,{member:randomToken(),access:r.access,name:'Replacement'})).status,200);
});
test('expiry and host destruction delete all room data with foreign-key cascades',async()=>{
 const r=await room();await send(r,{file:'b'.repeat(30),file_iv:'c'.repeat(16)});await post(`/${r.id}/react`,{member:r.member,seq:1,emoji:'🔥'});await pool.query("UPDATE whisper_rooms SET expires_at=now()-interval '1 second'");assert.equal((await sync(r)).status,410);
 for(const table of ['whisper_rooms','whisper_members','whisper_chat_messages','whisper_reactions'])assert.equal((await pool.query(`SELECT * FROM ${table}`)).rowCount,0);
 const next=await room();await send(next);assert.equal((await post(`/${next.id}/destroy`,{member:next.member})).status,200);assert.equal((await sync(next)).status,410);
});
test('anonymous browser roles cannot query chat tables or execute RPC; owner capped at two active rooms',async()=>{
 for(const name of ['whisper_rooms','whisper_members','whisper_chat_messages','whisper_reactions']){const r=await pool.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['anon','public.'+name,'SELECT']);assert.equal(r.rows[0].allowed,false)}
 assert.equal((await pool.query("SELECT has_function_privilege('anon','public.hush_chat_api(text,jsonb)','execute') AS allowed")).rows[0].allowed,false);
 await room();await room();const r=await post('',{id:randomToken(),member:randomToken(),access:randomToken(),name:'Host',ttl:86400,max_members:4,max_messages:10,mode:'total',keep:3});assert.equal(r.status,429);assert.equal(r.body.code,'roomLimit');
});
test('room storage ceiling refuses another attachment without incrementing sent count',async()=>{
 const r=await room({mode:'rolling',keep:20});for(let i=0;i<5;i++)assert.equal((await send(r,{file:'b'.repeat(350000),file_iv:'c'.repeat(16)})).status,201);
 const rejected=await send(r,{file:'b'.repeat(350000),file_iv:'c'.repeat(16)});assert.equal(rejected.status,413);assert.equal(rejected.body.code,'storageLimit');assert.equal((await sync(r)).body.sent,5);
});
test('changing anonymous cookies does not bypass the shared network room-creation budget',async()=>{
 for(let i=0;i<11;i++){
  const client={owner:(i+1).toString(16).padStart(64,'0'),network:'b'.repeat(64)};
  const result=await post('',{id:randomToken(),member:randomToken(),access:randomToken(),name:'Guest',ttl:172800,max_members:2,max_messages:10,mode:'total',keep:3},client);
  assert.equal(result.status,i<10?201:429);
 }
});
test('Unicode skin tones, ZWJ, flags and custom emoji round-trip; arbitrary reactions are rejected',async()=>{
 const r=await room();await send(r);
 for(const emoji of ['🧑🏽‍🚀','🇻🇳','🫶🏾',':whisper_hello:',':pepe_preview_happy:']){const result=await post(`/${r.id}/react`,{member:r.member,seq:1,emoji});assert.equal(result.status,200,JSON.stringify(result));assert.equal((await sync(r)).body.messages[0].reactions.some((v:{emoji:string})=>v.emoji===emoji),true)}
 for(const emoji of ['hello',':unknown_pack:','https://example.com/emoji.png'])assert.equal((await post(`/${r.id}/react`,{member:r.member,seq:1,emoji})).status,400);
 const credentials=(await pool.query('SELECT m.member_hash,r.owner_hash FROM public.whisper_members m JOIN public.whisper_rooms r ON r.id=m.room WHERE m.room=$1 AND m.host',[r.id])).rows[0];const direct=(await pool.query("SELECT public.hush_chat_api('chat_react',$1::jsonb) AS r",[JSON.stringify({id:r.id,...credentials,network_hash:'b'.repeat(64),seq:1,emoji:':unknown_pack:'})])).rows[0].r;assert.equal(direct.status,400);
 for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await pool.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['anon','public.whisper_emoji_catalog',privilege])).rows[0].allowed,false);
});
