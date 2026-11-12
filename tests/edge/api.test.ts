import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {handler} from '../../supabase/functions/whisper/handler.ts';
import {randomToken,seal,unseal} from '../../web/crypto.js';
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('TEST_DATABASE_URL must point to a disposable PostgreSQL database');
const pool=new pg.Pool({connectionString:url,max:10});
const origin='http://localhost:8788';
const api=handler({origin,pepper:'local-test-pepper-01234567890123456789',rpc:async(action,payload)=>{
 return (await pool.query('SELECT public.hush_api($1,$2::jsonb) AS result',[action,JSON.stringify({...payload,owner_hash:'a'.repeat(64),network_hash:'b'.repeat(64)})])).rows[0].result;
}});
async function post(path:string,value:unknown,requestOrigin=origin){
 const r=await api(new Request(origin+'/api'+path,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify(value)}));
 return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};
}
async function challenge(){const r=await post('/challenges',{mobile:false});assert.equal(r.status,200);return r.body;}
async function create(options:Record<string,unknown>={}){
 const {key,...box}=await seal('Private test text 🐚');const v={...box,access:randomToken(),revoke:randomToken(),ttl:600,burn:true,pin:null,...options};
 const c=await challenge();await new Promise(r=>setTimeout(r,550));
 const r=await post('/messages',{...v,verification:{id:c.id,answer:c.target}});assert.equal(r.status,201,JSON.stringify(r));
 return {...v,id:r.body.id,key};
}
before(async()=>{
 await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$");
 await pool.query('DROP FUNCTION IF EXISTS public.hush_api(text,jsonb),public.hush_api_core(text,jsonb),public.hush_take_budget(text,integer,integer); DROP TABLE IF EXISTS public.hush_challenges,public.hush_budgets,public.hush_messages,public.hush_abuse_budgets');
 for(const file of ['202611110001_messages.sql','202611110002_restrict_access.sql','202611110004_edge_api.sql','202611110005_safe_previews.sql','202611120001_abuse_limits.sql']){
  const sql=await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8');
  // Plain PostgreSQL has no Supabase pg_cron. The real job is checked after cloud deployment.
  await pool.query(sql.split('-- Keep existing independent')[0]);
 }
});
beforeEach(async()=>{await pool.query('TRUNCATE public.hush_messages,public.hush_challenges,public.hush_budgets,public.hush_abuse_budgets');});
after(()=>pool.end());
test('encrypted content roundtrips; metadata never consumes; burn-on-read rejects reuse',async()=>{
 const v=await create();for(let i=0;i<2;i++)assert.equal((await post(`/messages/${v.id}/metadata`,{access:v.access})).status,200);
 const row=(await pool.query('SELECT * FROM hush_messages')).rows[0];assert.equal(row.access_hash.length,64);assert.notEqual(row.access_hash,v.access);assert.equal(row.pin_hash,'');assert.ok(!JSON.stringify(row).includes('Private test'));
 const opened=await post(`/messages/${v.id}/open`,{access:v.access});assert.equal(opened.status,200);assert.equal(await unseal(opened.body.ciphertext,opened.body.iv,v.key),'Private test text 🐚');
 assert.equal((await post(`/messages/${v.id}/open`,{access:v.access})).status,410);
});
test('two concurrent authorized opens have exactly one winner',async()=>{
 const v=await create();const r=await Promise.all([post(`/messages/${v.id}/open`,{access:v.access}),post(`/messages/${v.id}/open`,{access:v.access})]);
 assert.deepEqual(r.map(v=>v.status).sort(),[200,410]);
});
test('missing PIN and wrong capability do not consume attempts; right PIN still works',async()=>{
 const v=await create({pin:'123456'});
 assert.equal((await post(`/messages/${v.id}/open`,{access:randomToken(),pin:'000000'})).status,410);
 for(let i=0;i<6;i++)assert.equal((await post(`/messages/${v.id}/open`,{access:v.access})).status,401);
 assert.equal((await pool.query('SELECT attempts FROM hush_messages')).rows[0].attempts,0);
 assert.equal((await post(`/messages/${v.id}/open`,{access:v.access,pin:'111111'})).status,401);
 assert.equal((await post(`/messages/${v.id}/open`,{access:v.access,pin:'123456'})).status,200);
});
test('five concurrent bad PINs destroy the row atomically',async()=>{
 const v=await create({pin:'123456'});const r=await Promise.all(Array.from({length:5},()=>post(`/messages/${v.id}/open`,{access:v.access,pin:'111111'})));
 assert.deepEqual(r.map(v=>v.status).sort(),[401,401,401,401,410]);assert.equal((await post(`/messages/${v.id}/open`,{access:v.access,pin:'123456'})).status,410);
});
test('timed messages reopen; revoke needs the separate capability',async()=>{
 const v=await create({burn:false});for(let i=0;i<2;i++)assert.equal((await post(`/messages/${v.id}/open`,{access:v.access})).status,200);
 assert.equal((await post(`/messages/${v.id}/revoke`,{revoke:v.access})).status,204);assert.equal((await post(`/messages/${v.id}/metadata`,{access:v.access})).status,200);
 assert.equal((await post(`/messages/${v.id}/revoke`,{revoke:v.revoke})).status,204);assert.equal((await post(`/messages/${v.id}/open`,{access:v.access})).status,410);
});
test('expired rows cannot be opened or inspected even before cron runs',async()=>{
 const v=await create({burn:false});await pool.query('UPDATE hush_messages SET expires_at=0');for(const action of ['metadata','open'])assert.equal((await post(`/messages/${v.id}/${action}`,{access:v.access})).status,410);
});
test('challenge is single-use and rejects too-fast, incorrect and expired answers',async()=>{
 const {key,...box}=await seal('challenge');const base={...box,access:randomToken(),revoke:randomToken(),ttl:60,burn:true};
 for(const kind of ['fast','wrong','expired']){
  const c=await challenge();if(kind!=='fast')await pool.query("UPDATE hush_challenges SET issued_at=clock_timestamp()-interval '1 second'");
  if(kind==='expired')await pool.query("UPDATE hush_challenges SET issued_at=clock_timestamp()-interval '121 seconds'");
  const data={...base,verification:{id:c.id,answer:kind==='wrong'?(c.target%100)+1:c.target}};
  assert.equal((await post('/messages',data)).status,400);assert.equal((await post('/messages',data)).status,400);
 }
 assert.equal((await pool.query('SELECT count(*) FROM hush_messages')).rows[0].count,'0');
});
test('mobile challenge uses 100 and rate budget persists across handler instances',async()=>{
 assert.equal((await post('/challenges',{mobile:true})).body.target,100);
 await pool.query("UPDATE hush_budgets SET used=90 WHERE action='challenge'");assert.equal((await post('/challenges',{mobile:false})).status,429);
 await pool.query("UPDATE hush_budgets SET window_at=clock_timestamp()-interval '61 seconds'");assert.equal((await challenge()).expires_in,120);
});
test('public roles cannot read ciphertext or invoke privileged RPC',async()=>{
 for(const role of ['anon','authenticated']){
  assert.equal((await pool.query("SELECT has_table_privilege($1,'public.hush_messages','SELECT') AS allowed",[role])).rows[0].allowed,false);
  assert.equal((await pool.query("SELECT has_function_privilege($1,'public.hush_api(text,jsonb)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
 }
 assert.equal((await pool.query("SELECT has_function_privilege('service_role','public.hush_api(text,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,true);
});
test('origin, content type, unknown fields and oversized request fail closed',async()=>{
 assert.equal((await post('/challenges',{mobile:false},'https://bad.example')).status,403);
 for(const v of [{mobile:'false'},{mobile:false,extra:true},[],null])assert.equal((await post('/challenges',v)).status,400);
 assert.equal((await api(new Request(origin+'/api/challenges',{method:'POST',headers:{origin,'content-type':'text/plain'},body:'{}'}))).status,400);
 assert.equal((await api(new Request(origin+'/api/challenges',{method:'POST',headers:{origin,'content-type':'application/json'},body:'x'.repeat(2850001)}))).status,413);
 const r=await post('/challenges',{mobile:false});assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');
});
test('invalid create data is rejected; full encrypted audio-size payload is accepted',async()=>{
 const base={ciphertext:Buffer.alloc(17).toString('base64url'),iv:Buffer.alloc(12).toString('base64url'),access:randomToken(),revoke:randomToken(),ttl:600,burn:true};
 for(const patch of [{ttl:0},{ttl:604801},{pin:'123'},{iv:'x'},{ciphertext:'a'},{id:'bad'},{extra:true},{burn:1},{revoke:base.access}])assert.equal((await post('/messages',{...base,...patch})).status,400);
 assert.equal((await post('/messages',base)).status,400);
 const c=await challenge();await new Promise(r=>setTimeout(r,550));const result=await post('/messages',{...base,ciphertext:Buffer.alloc(2097168).toString('base64url'),verification:{id:c.id,answer:c.target}});assert.equal(result.status,201);
});
test('duplicate lookup ids return conflict rather than replacing content',async()=>{
 const v=await create();const c=await challenge();await new Promise(r=>setTimeout(r,550));const {key,...data}=v;
 assert.equal((await post('/messages',{...data,verification:{id:c.id,answer:c.target}})).status,409);
});
test('preflight and health work; methods and database failures fail safely',async()=>{
 assert.equal((await api(new Request(origin+'/health'))).status,200);
 assert.equal((await api(new Request(origin+'/api/messages',{headers:{origin}}))).status,405);
 const preflight=await api(new Request(origin+'/api/challenges',{method:'OPTIONS',headers:{origin}}));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 const failed=handler({origin,pepper:'another-test-pepper-01234567890123456789',rpc:async()=>{throw new TypeError('secret provider error');}});
 const r=await failed(new Request(origin+'/api/challenges',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"mobile":false}'}));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('secret'));
});

test('Supabase gateway function-relative paths are routed without relaxing origin checks',async()=>{
 for(const prefix of ['/functions/v1/whisper','/whisper','/api','']){
  assert.equal((await api(new Request(origin+prefix+'/health'))).status,200);
  const r=await api(new Request(origin+prefix+'/challenges',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"mobile":false}'}));
  assert.equal(r.status,200);
 }
 assert.equal((await api(new Request(origin+'/whisper/challenges',{method:'POST',headers:{origin:'https://wrong.invalid','content-type':'application/json'},body:'{"mobile":false}'}))).status,403);
});

test('public preview GET exposes exactly burn/expiry, never consumes or bypasses PIN',async()=>{
 const v=await create({pin:'123456'}),handle=v.id.slice(0,16);
 for(let i=0;i<2;i++){
  const r=await api(new Request(origin+'/api/preview/'+handle));assert.equal(r.status,200);
  const data=await r.json();assert.deepEqual(Object.keys(data).sort(),['burn','expires_at']);assert.equal(data.burn,true);
 }
 assert.equal((await post(`/messages/${v.id}/open`,{access:v.access,pin:'000000'})).status,401);
 assert.equal((await post(`/messages/${v.id}/open`,{access:v.access,pin:'123456'})).status,200);
 assert.equal((await api(new Request(origin+'/api/preview/'+handle))).status,410);
 const timed=await create({burn:false});await pool.query('UPDATE hush_messages SET expires_at=0');assert.equal((await api(new Request(origin+'/api/preview/'+timed.id.slice(0,16)))).status,410);
 const invalid=await api(new Request(origin+'/api/preview/bad'));assert.notEqual(invalid.status,200);
});

// Exercise the production signature + database path, not the legacy fixture identity above.
import {signClient} from '../../supabase/functions/whisper/gateway.ts';
const gatewaySecret='edge-abuse-test-gateway-secret-01234567890123456789';
const protectedAPI=handler({origin,pepper:'local-test-pepper-01234567890123456789',gatewaySecret,rpc:async(action,payload)=>(await pool.query('SELECT public.hush_api($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result});
const ownerA='1'.repeat(64),netA='2'.repeat(64);
async function guarded(path:string,v:unknown,owner=ownerA,network=netA){const r=await protectedAPI(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...await signClient(gatewaySecret,'POST',path,{owner,network})},body:JSON.stringify(v)}));return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};}
async function prepared(owner=ownerA,network=netA,pin:string|null=null){
 const c=await guarded('/challenges',{mobile:false},owner,network);assert.equal(c.status,200);
 await pool.query("UPDATE hush_challenges SET issued_at=clock_timestamp()-interval '1 second' WHERE owner_hash=$1",[owner]);
 const {key,...box}=await seal('Synthetic abuse test');return {...box,id:randomToken(),access:randomToken(),revoke:randomToken(),ttl:600,burn:true,pin,verification:{id:c.body.id,answer:c.body.target}};
}
test('three simultaneous creates by one browser produce exactly two links',async()=>{
 const submissions=await Promise.all(Array.from({length:3},()=>prepared()));
 const r=await Promise.all(submissions.map(v=>guarded('/messages',v)));assert.deepEqual(r.map(x=>x.status).sort(),[201,201,409]);
 assert.equal((await pool.query('SELECT count(*) FROM hush_messages WHERE owner_hash=$1',[ownerA])).rows[0].count,'2');
});
for(const release of ['read','revoke','expire','pin'])test(`two-link slot is released on ${release}`,async()=>{
 const a=await prepared(ownerA,netA,release==='pin'?'123456':null),b=await prepared(),c=await prepared();
 assert.equal((await guarded('/messages',a)).status,201);assert.equal((await guarded('/messages',b)).status,201);assert.equal((await guarded('/messages',c)).body.code,'activeLimit');
 if(release==='read')assert.equal((await guarded(`/messages/${a.id}/open`,{access:a.access})).status,200);
 if(release==='revoke')assert.equal((await guarded(`/messages/${a.id}/revoke`,{revoke:a.revoke})).status,204);
 if(release==='expire')await pool.query('UPDATE hush_messages SET expires_at=0 WHERE id=$1',[a.id]);
 if(release==='pin')for(let i=0;i<5;i++)await guarded(`/messages/${a.id}/open`,{access:a.access,pin:'000000'});
 assert.equal((await guarded('/messages',c)).status,201);
});
test('resetting device cookies cannot escape the shared network creation budget',async()=>{
 for(let i=0;i<31;i++){
  const owner=(i+16).toString(16).padStart(64,'0'),v=await prepared(owner);
  const r=await guarded('/messages',v,owner);assert.equal(r.status,i<30?201:429,JSON.stringify(r));
 }
});
test('daily creation cap and hourly owner cap survive new handler requests',async()=>{
 await pool.query("INSERT INTO hush_abuse_budgets VALUES('create:global:day',200,clock_timestamp()+interval '1 hour')");
 const a=await prepared();assert.equal((await guarded('/messages',a)).status,429);
 await pool.query('TRUNCATE hush_abuse_budgets');
 await pool.query("INSERT INTO hush_abuse_budgets VALUES($1,10,clock_timestamp()+interval '1 hour')",['create:owner:hour:'+ownerA]);
 assert.equal((await guarded('/messages',a)).status,429);
 assert.equal((await pool.query('SELECT count(*) FROM hush_messages')).rows[0].count,'0');
});
test('challenges are bound to their issuing browser; expired budgets reset',async()=>{
 const a=await prepared();assert.equal((await guarded('/messages',a,'3'.repeat(64))).status,400);assert.equal((await guarded('/messages',a)).status,201);
 await pool.query("INSERT INTO hush_abuse_budgets VALUES($1,120,clock_timestamp()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET used=120,expires_at=excluded.expires_at",['request:network:'+netA]);
 assert.equal((await guarded('/challenges',{mobile:false})).status,429);
 await pool.query("UPDATE hush_abuse_budgets SET expires_at=clock_timestamp()-interval '1 second'");
 assert.equal((await guarded('/challenges',{mobile:false})).status,200);
});
test('music searches consume a distributed global budget before contacting the provider',async()=>{
 for(let i=0;i<21;i++){
  const r=await guarded('/music-budget',{},(i+20).toString(16).padStart(64,'0'),(i+40).toString(16).padStart(64,'0'));
  assert.equal(r.status,i<20?200:429);
 }
});
