// Disposable public-API smoke checks. No message/link credentials are logged.
import assert from 'node:assert/strict';
import {seal,unseal,randomToken} from '../web/crypto.js';
const base=process.env.SMOKE_API_BASE,origin=process.env.APP_ORIGIN;
if(!base||!origin)throw new Error('Set SMOKE_API_BASE and APP_ORIGIN for the intended deployment');
const pending=[];
async function post(path,data,source=origin){
 const r=await fetch(base+path,{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.match(r.headers.get('cache-control')||'',/no-store/);
 return {status:r.status,body:r.status===204?null:await r.json()};
}
async function create(extra={}){
 const {key,...box}=await seal('Whisper disposable cloud QC 🐚');
 const c=await post('/challenges',{mobile:false});assert.equal(c.status,200);
 await new Promise(r=>setTimeout(r,650));
 const v={...box,access:randomToken(),revoke:randomToken(),ttl:60,burn:true,...extra,verification:{id:c.body.id,answer:c.body.target}};
 const r=await post('/messages',v);assert.equal(r.status,201,JSON.stringify(r));
 const record={...v,key,id:r.body.id};pending.push(record);return record;
}
try{
 const h=await fetch(base+'/health');assert.equal(h.status,200);assert.equal((await h.json()).ok,true);
 assert.equal((await post('/challenges',{mobile:false},'https://untrusted.invalid')).status,403);
 const v=await create();
 for(let n=0;n<2;n++)assert.equal((await post(`/messages/${v.id}/metadata`,{access:v.access})).status,200);
 const race=await Promise.all([1,2].map(()=>post(`/messages/${v.id}/open`,{access:v.access})));
 assert.deepEqual(race.map(r=>r.status).sort(),[200,410]);
 const success=race.find(r=>r.status===200);assert.equal(await unseal(success.body.ciphertext,success.body.iv,v.key),'Whisper disposable cloud QC 🐚');
 const p=await create({pin:'725109'});
 assert.equal((await post(`/messages/${p.id}/open`,{access:p.access})).status,401);
 assert.equal((await post(`/messages/${p.id}/open`,{access:p.access,pin:'000000'})).status,401);
 assert.equal((await post(`/messages/${p.id}/open`,{access:p.access,pin:'725109'})).status,200);
 const t=await create({burn:false});
 for(let n=0;n<2;n++)assert.equal((await post(`/messages/${t.id}/open`,{access:t.access})).status,200);
 assert.equal((await post(`/messages/${t.id}/revoke`,{revoke:t.revoke})).status,204);
 assert.equal((await post(`/messages/${t.id}/metadata`,{access:t.access})).status,410);
 const lock=await create({pin:'725109'});
 const wrong=await Promise.all(Array.from({length:5},()=>post(`/messages/${lock.id}/open`,{access:lock.access,pin:'000000'})));
 assert.deepEqual(wrong.map(r=>r.status).sort(),[401,401,401,401,410]);
 console.log('Live API passed: health, origin, metadata, encrypted roundtrip, concurrent single read, PIN retry/lockout, timed reopen and revoke.');
}finally{
 for(const v of pending)await post(`/messages/${v.id}/revoke`,{revoke:v.revoke}).catch(()=>{});
}
