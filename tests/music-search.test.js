import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSearch,cdn} from '../experiments/deezer-preview/search.mjs';
test('music search validates queries before fetching and restricts untrusted CDN URLs',async()=>{
 let calls=0;const search=createSearch(async()=>{calls++;return {ok:true,json:async()=>({data:[{id:7,title:'Song',preview:'https://attacker.example/a',album:{cover_big:'https://x.dzcdn.net/a.jpg'}},{id:'invalid'}]})};});
 assert.equal((await search('x')).status,400);assert.equal(calls,0);
 const r=await search('a song');assert.equal(r.body.tracks.length,1);assert.equal(r.body.tracks[0].preview,null);assert.equal(r.body.tracks[0].cover,'https://x.dzcdn.net/a.jpg');
 assert.equal((await search('again')).status,429);assert.equal(calls,1);
 assert.equal(cdn('http://x.dzcdn.net/a'),null);assert.equal(cdn('https://dzcdn.net.evil.com/a'),null);
});
test('music upstream errors and malformed responses remain controlled',async()=>{
 for(const fetcher of [async()=>{throw Error('network');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({error:{}})})])assert.equal((await createSearch(fetcher)('valid')).status,502);
});
