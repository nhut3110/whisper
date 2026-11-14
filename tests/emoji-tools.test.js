import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {zipSync} from 'fflate';
import {createEmojiTools,boundedFetch,packURL} from '../scripts/emoji-tools.mjs';
import {emojiWorkerPermissions} from '../scripts/emoji-tool-permissions.mjs';
const repo=path.resolve(import.meta.dirname,'..');
async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'whisper-emoji-tools-'));
 try{
  await fs.mkdir(path.join(root,'shared'));await fs.writeFile(path.join(root,'shared/emoji-packs.json'),'[]');
  const inbox=path.join(root,'emoji-import-local/inbox');await fs.mkdir(inbox,{recursive:true});
  const image=await sharp({create:{width:16,height:16,channels:4,background:'#9a8'}}).png().toBuffer();
  const zip=Buffer.from(zipSync({'happy.png':image,'hello.png':image}));await fs.writeFile(path.join(inbox,'demo.zip'),zip);
  const args={pack_url:'https://emoji.gg/pack/123-demo',id:'demo',name:'Demo',attribution:'Test artist',permission:'Original test fixture, MIT',archive_file:'demo.zip',expected_count:2};
  await run({root,inbox,image,zip,args,tools:createEmojiTools(root)});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('local tool previews a FULL ZIP then imports every emoji, with no changes outside its three publish targets',()=>fixture(async({root,args,tools})=>{
 const before=await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8');const plan=await tools.call('emoji_pack_prepare',args);
 assert.equal(plan.count,2);assert.equal(plan.applied,false);assert.equal(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'),before);
 const result=await tools.call('emoji_pack_apply',{plan_id:plan.plan_id});assert.equal(result.count,2);assert.equal(result.pushed,false);assert.equal(result.deployed,false);
 const packs=JSON.parse(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'));assert.equal(packs[0].emojis.length,2);
 for(const e of packs[0].emojis)assert.ok((await fs.readFile(path.join(root,'public',e.src))).length);
 assert.match(await fs.readFile(path.join(root,result.migration),'utf8'),/INSERT INTO public.whisper_emoji_catalog/);
 assert.deepEqual((await fs.readdir(path.join(root,'shared'))),['emoji-packs.json']);
 await assert.rejects(tools.call('emoji_pack_prepare',args),/already exists/);
 await assert.rejects(tools.call('emoji_pack_apply',{plan_id:plan.plan_id}));
}));
test('count mismatch refuses a partial pack and cleans the failed stage',()=>fixture(async({root,args,tools})=>{
 await assert.rejects(tools.call('emoji_pack_prepare',{...args,expected_count:3}),/Incomplete pack/);
 assert.deepEqual(await fs.readdir(path.join(root,'emoji-import-local/staging')),[]);assert.equal(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'),'[]');
}));
test('tool rejects arbitrary roots, path traversal, extra commands, unsafe origins and symlinked inbox files',()=>fixture(async({root,args,tools,inbox})=>{
 await assert.rejects(tools.call('shell',{}),/Unknown/);
 for(const patch of [{root:'/tmp'},{archive_file:'../../secret.zip'},{id:'../bad'},{pack_url:'https://evil.example/pack/123-demo'},{pack_url:'https://emoji.gg/pack/123-demo?x=1'}])await assert.rejects(tools.call('emoji_pack_prepare',{...args,...patch}));
 await fs.symlink(path.join(inbox,'demo.zip'),path.join(inbox,'link.zip'));await assert.rejects(tools.call('emoji_pack_prepare',{...args,archive_file:'link.zip'}),/Symlink/);
 await assert.rejects(tools.call('emoji_pack_apply',{plan_id:'../../secret'}),/Invalid/);
 assert.throws(()=>packURL('https://emoji.gg@evil.example/pack/123-demo'));
}));
test('tampered bytes and expired plans cannot be applied',()=>fixture(async({root,args,tools})=>{
 const plan=await tools.call('emoji_pack_prepare',args),dir=path.join(root,'emoji-import-local/staging',plan.plan_id);
 await fs.writeFile(path.join(dir,'permission.txt'),'changed');await assert.rejects(tools.call('emoji_pack_apply',{plan_id:plan.plan_id}),/changed/);
 const second=await tools.call('emoji_pack_prepare',args),p=path.join(root,'emoji-import-local/staging',second.plan_id,'plan.json');const manifest=JSON.parse(await fs.readFile(p,'utf8'));manifest.createdAt=0;await fs.writeFile(p,JSON.stringify(manifest));await assert.rejects(tools.call('emoji_pack_apply',{plan_id:second.plan_id}),/expired/);
}));
test('symlink output cannot redirect publication outside the emoji scope',()=>fixture(async({root,args,tools})=>{
 const plan=await tools.call('emoji_pack_prepare',args);await fs.mkdir(path.join(root,'public'));await fs.symlink(path.join(root,'shared'),path.join(root,'public/emoji-packs'));
 await assert.rejects(tools.call('emoji_pack_apply',{plan_id:plan.plan_id}),/Symlink/);assert.equal(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'),'[]');
}));
test('write failure rolls back new pack assets and migration, retaining registry and unrelated files',()=>fixture(async({root,args,tools})=>{
 const plan=await tools.call('emoji_pack_prepare',args);await fs.writeFile(path.join(root,'shared/.emoji-packs.pending'),'unrelated stale file');
 await assert.rejects(tools.call('emoji_pack_apply',{plan_id:plan.plan_id}),/EEXIST/);
 assert.equal(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'),'[]');assert.equal(await fs.readFile(path.join(root,'shared/.emoji-packs.pending'),'utf8'),'unrelated stale file');
 assert.deepEqual(await fs.readdir(path.join(root,'public/emoji-packs')),[]);assert.deepEqual(await fs.readdir(path.join(root,'supabase/migrations')),[]);
}));
test('public API flow follows the exact pack id and downloads the complete ZIP',()=>fixture(async({root,zip,args})=>{
 const calls=[];const tools=createEmojiTools(root,{fetcher:async url=>{calls.push(String(url));return String(url).includes('/api/')?Response.json([{id:123,name:'Demo',amount:2,download:'https://emoji.gg/assets/packs/download/demo.zip'}]):new Response(zip)}});
 const {archive_file,expected_count,...remote}=args;const plan=await tools.call('emoji_pack_prepare',remote);assert.equal(plan.count,2);assert.deepEqual(calls,['https://emoji.gg/api/packs','https://emoji.gg/assets/packs/download/demo.zip']);
 assert.equal((await tools.call('emoji_pack_apply',{plan_id:plan.plan_id})).count,2);
}));
test('HTTP challenge, unsafe redirects, oversized streams and HTML archives fail without importing previews',()=>fixture(async({root,args})=>{
 const {archive_file,...remote}=args;const tools=createEmojiTools(root,{fetcher:async()=>new Response('challenge',{status:403})});await assert.rejects(tools.call('emoji_pack_prepare',remote),/SOURCE_BLOCKED/);
 await assert.rejects(boundedFetch('https://emoji.gg/assets/packs/download/test.zip',100,async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})),/Unapproved/);
 await assert.rejects(boundedFetch('https://emoji.gg/assets/packs/download/test.zip',4,async()=>new Response('12345')),/limit/);
 await fs.writeFile(path.join(root,'emoji-import-local/inbox/demo.zip'),'<html>login</html>');await assert.rejects(createEmojiTools(root).call('emoji_pack_prepare',args),/Expected a ZIP/);
}));
test('actual restricted launcher speaks MCP and rejects non-emoji calls',()=>{
 const requests=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'emoji_packs_list',arguments:{}}},{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'shell',arguments:{command:'whoami'}}}];
 const r=spawnSync(process.execPath,['scripts/emoji-tool.mjs'],{cwd:repo,input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n',encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);
 const replies=r.stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(replies[0].result.serverInfo.name,'whisper-emoji');assert.deepEqual(replies[1].result.tools.map(t=>t.name),['emoji_packs_list','emoji_pack_prepare','emoji_pack_apply']);assert.ok(JSON.parse(replies[2].result.content[0].text).packs.length);assert.equal(replies[3].result.isError,true);
});
test('worker permission flags deny unrelated file reads/writes and child processes',()=>{
 const code=`import fs from 'node:fs';import {spawnSync} from 'node:child_process';const codes=[];for(const op of [()=>fs.readFileSync(${JSON.stringify(path.join(repo,'.env'))}),()=>fs.writeFileSync(${JSON.stringify(path.join(repo,'frontend','DO-NOT-WRITE'))},'bad'),()=>spawnSync('whoami')]){try{op();codes.push('UNEXPECTED')}catch(e){codes.push(e.code)}}console.log(JSON.stringify(codes))`;
 const r=spawnSync(process.execPath,[...emojiWorkerPermissions(repo),'--input-type=module','-e',code],{cwd:repo,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),['ERR_ACCESS_DENIED','ERR_ACCESS_DENIED','ERR_ACCESS_DENIED']);
});

test('restricted worker performs prepare and apply end to end in an isolated checkout',()=>fixture(async({root,args})=>{
 await fs.cp(path.join(repo,'scripts'),path.join(root,'scripts'),{recursive:true});await fs.symlink(path.join(repo,'node_modules'),path.join(root,'node_modules'));
 await fs.writeFile(path.join(root,'package.json'),'{}');await fs.mkdir(path.join(root,'public/emoji-packs'),{recursive:true});await fs.mkdir(path.join(root,'supabase/migrations'),{recursive:true});
 const invoke=(name,input)=>{const result=spawnSync(process.execPath,[path.join(root,'scripts/emoji-tool.mjs'),name,JSON.stringify(input)],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)};
 const plan=invoke('emoji_pack_prepare',args);assert.equal(plan.count,2);const result=invoke('emoji_pack_apply',{plan_id:plan.plan_id});assert.equal(result.count,2);assert.equal(result.deployed,false);
}));

test('optional normalization retains all emoji while resizing source images to existing limits',()=>fixture(async({root,args,tools})=>{
 const big=await sharp({create:{width:500,height:400,channels:4,background:'#99aa88'}}).png().toBuffer();
 await fs.writeFile(path.join(root,'emoji-import-local/inbox/demo.zip'),Buffer.from(zipSync({'big.png':big,'second.png':big})));
 await assert.rejects(tools.call('emoji_pack_prepare',args),/dimensions/);
 const plan=await tools.call('emoji_pack_prepare',{...args,resize_to_fit:true});assert.equal(plan.count,2);assert.equal(plan.normalization.changed.length,2);
 await tools.call('emoji_pack_apply',{plan_id:plan.plan_id});const pack=JSON.parse(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'))[0];
 for(const e of pack.emojis){const m=await sharp(await fs.readFile(path.join(root,'public',e.src))).metadata();assert.ok(m.width<=256&&m.height<=256);}
 assert.match(pack.license,/all emoji and animation frames retained/);
}));

test('normalization preserves duplicate GIF frames and timing instead of collapsing animation',()=>fixture(async({root,args,tools})=>{
 const animated=await sharp({create:{width:300,height:600,pageHeight:300,channels:4,background:'#66aa88'}}).gif({keepDuplicateFrames:true,delay:[100,150],loop:0}).toBuffer();
 const before=await sharp(animated,{animated:true}).metadata();assert.equal(before.pages,2);
 await fs.writeFile(path.join(root,'emoji-import-local/inbox/demo.zip'),Buffer.from(zipSync({'animated.gif':animated})));
 const plan=await tools.call('emoji_pack_prepare',{...args,expected_count:1,resize_to_fit:true});await tools.call('emoji_pack_apply',{plan_id:plan.plan_id});
 const pack=JSON.parse(await fs.readFile(path.join(root,'shared/emoji-packs.json'),'utf8'))[0];const after=await sharp(await fs.readFile(path.join(root,'public',pack.emojis[0].src)),{animated:true}).metadata();assert.equal(after.pages,2);assert.deepEqual(after.delay,before.delay);assert.equal(after.loop,before.loop);
}));
