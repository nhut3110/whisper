import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync,existsSync} from 'node:fs';
test('music beta is opt-in; its CDN policy never relaxes private message pages',()=>{
 const env={...process.env,SUPABASE_PROJECT_REF:'hzzmzskqmgowntzqfxrd',INCLUDE_MUSIC_BETA:'0'};
 const build=()=>execFileSync(process.execPath,['scripts/build-web.mjs'],{env,stdio:'pipe'});
 build();const root='.vercel/output/';assert.equal(existsSync(root+'static/music-beta'),false);assert.equal(existsSync(root+'functions/music-search.func'),false);
 assert.ok(!readFileSync(root+'static/index.html','utf8').includes('/music-beta/'));
 env.INCLUDE_MUSIC_BETA='1';build();
 const config=JSON.parse(readFileSync(root+'config.json','utf8')),policies=config.routes.filter(r=>r.headers?.['Content-Security-Policy']);
 assert.equal(policies.length,2);assert.match(policies[0].headers['Content-Security-Policy'],/dzcdn/);assert.ok(!policies[1].headers['Content-Security-Policy'].includes('dzcdn'));
 assert.match(policies[1].src,/\?!music-beta/);
 assert.ok(readFileSync(root+'static/music-beta/app.js','utf8').includes('/music-beta/search'));
 assert.ok(readFileSync(root+'static/music-beta/interactions.js','utf8').includes("'/music-beta/i18n.js'"));
 assert.ok(readFileSync(root+'static/index.html','utf8').includes('♫ (beta)'));
});
