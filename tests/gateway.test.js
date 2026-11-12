import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {gatewayHandler} from '../server/gateway.mjs';import {readClient,signClient} from '../supabase/functions/whisper/gateway.ts';import {handler} from '../supabase/functions/whisper/handler.ts';
const secret='only-a-local-test-gateway-secret-0123456789',origin='https://whisper.test',upstream='https://edge.test/functions/v1/whisper';
const client={owner:'a'.repeat(64),network:'b'.repeat(64)};
async function invoke(gateway,{headers={},parts=['{}'],path='/api/challenges',method='POST'}={}){
 const req=Readable.from(parts.map(x=>Buffer.from(x)));Object.assign(req,{url:path,method,headers:{origin,'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.4',...headers}});
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(body){this.body=body;}};await gateway(req,res);return res;
}
test('gateway issues signed HttpOnly cookie, strips spoofed identity and keeps the same owner across requests',async()=>{
 const seen=[];const gateway=gatewayHandler({secret,origin,upstream,fetcher:async(url,options)=>{seen.push({url,options});return new Response('{}',{status:201});}});
 const first=await invoke(gateway,{headers:{'x-whisper-owner':'f'.repeat(64),'x-forwarded-for':'198.51.100.2'}});assert.equal(first.statusCode,201);assert.match(first.headers['set-cookie'],/HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);
 const cookie=first.headers['set-cookie'].split(';')[0];const a=await readClient(secret,new Request(seen[0].url,{method:'POST',headers:seen[0].options.headers}));assert.ok(a);assert.notEqual(a.owner,'f'.repeat(64));
 await invoke(gateway,{headers:{cookie}});const b=await readClient(secret,new Request(seen[1].url,{method:'POST',headers:seen[1].options.headers}));assert.deepEqual(a,b);
 await invoke(gateway,{headers:{cookie:cookie.replace(/.$/,'x')}});const c=await readClient(secret,new Request(seen[2].url,{method:'POST',headers:seen[2].options.headers}));assert.notEqual(c.owner,a.owner);assert.equal(c.network,a.network);
});
test('gateway rejects malformed/oversized calls before forwarding and fails closed without platform IP',async()=>{
 let calls=0;const gateway=gatewayHandler({secret,origin,upstream,fetcher:async()=>{calls++;throw Error('private provider detail');}});
 for(const [options,status] of [[{headers:{origin:'https://evil.test'}},403],[{method:'GET'},405],[{path:'/api/other'},404],[{headers:{'content-type':'text/plain'}},400],[{headers:{'content-length':'2850001'}},413],[{parts:['x'.repeat(2850001)]},413],[{headers:{'x-vercel-forwarded-for':'spoof, 1.2.3.4'}},503]])assert.equal((await invoke(gateway,options)).statusCode,status);
 assert.equal(calls,0);const r=await invoke(gateway);assert.equal(r.statusCode,503);assert.ok(!r.body.includes('private provider'));assert.equal(calls,1);
});
test('Edge denies direct calls, altered signed paths, stale signatures and forged identities before touching database',async()=>{
 let calls=0;const api=handler({origin,pepper:secret,gatewaySecret:secret,rpc:async()=>{calls++;return {status:200,body:{}};}});
 const post=async(headers={},path='/challenges')=>api(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:'{"mobile":false}'}));
 assert.equal((await post()).status,403);
 const headers=await signClient(secret,'POST','/challenges',client);
 assert.equal((await post({...headers,'x-whisper-owner':'c'.repeat(64)})).status,403);assert.equal((await post(headers,'/messages')).status,403);
 assert.equal((await post(await signClient(secret,'POST','/challenges',client,Date.now()-60000))).status,403);assert.equal(calls,0);
 assert.equal((await post(headers)).status,200);assert.equal(calls,2);
});
test('Edge admission budget runs before JSON decoding and returns Retry-After',async()=>{
 const api=handler({origin,pepper:secret,gatewaySecret:secret,rpc:async action=>{assert.equal(action,'guard');return {status:429,body:{code:'rateLimit'}};}});
 const r=await api(new Request(origin+'/messages',{method:'POST',headers:{origin,'content-type':'application/json',...await signClient(secret,'POST','/messages',client)},body:'not json'}));assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
});
test('rewritten API paths preserve routing and warm-instance bursts are bounded before buffering',async()=>{
 let calls=0;const gateway=gatewayHandler({secret,origin,upstream,fetcher:async url=>{assert.equal(url,upstream+'/challenges');calls++;return new Response('{}');}});
 for(let i=0;i<60;i++)assert.equal((await invoke(gateway,{path:'/gateway?path=challenges'})).statusCode,200);
 const blocked=await invoke(gateway,{parts:['not json']});assert.equal(blocked.statusCode,429);assert.equal(blocked.headers['retry-after'],'60');assert.equal(calls,60);
});

import {musicHandler} from '../server/music.mjs';
test('hosted music search stops on shared budget rejection and uses signed identity for admission',async()=>{
 let searches=0;const searcher=async(req,res)=>{searches++;res.end('{}');};
 const denied=musicHandler({secret,origin,upstream,searcher,fetcher:async(url,options)=>{assert.equal(url,upstream+'/music-budget');assert.ok(await readClient(secret,new Request(url,{method:'POST',headers:options.headers})));return new Response('{}',{status:429});}});
 const r=await invoke(denied,{path:'/music-beta/search?q=test',method:'GET'});assert.equal(r.statusCode,429);assert.equal(r.headers['retry-after'],'60');assert.equal(searches,0);const lookup=await invoke(denied,{path:'/music-beta/search?id=3135556',method:'GET'});assert.equal(lookup.statusCode,429);assert.equal(searches,0);
 const allowed=musicHandler({secret,origin,upstream,searcher,fetcher:async()=>new Response('{}')});await invoke(allowed,{path:'/music-beta/search?q=test',method:'GET'});assert.equal(searches,1);
 assert.equal((await invoke(allowed,{path:'/music-beta/search?q=x',method:'GET'})).statusCode,400);
 assert.equal((await invoke(allowed,{path:'/music-beta/search?q=test'})).statusCode,405);
});
