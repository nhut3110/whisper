// One release gate for local development and GitHub Actions. Never deploys/pushes.
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,createWriteStream,rmSync,readFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const ci=process.argv.includes('--ci');
if(process.argv.slice(2).some(arg=>arg!=='--ci'))throw Error('Usage: node scripts/check.mjs [--ci]');
const dir=path.resolve('coverage/checks',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(dir,{recursive:true});
const env={...process.env,CI:'1',SUPABASE_PROJECT_REF:'hzzmzskqmgowntzqfxrd'};
delete env.EDGE_TEST_BASE;
delete env.CHAT_TESTS;
delete env.TEST_DATABASE_URL;
const results=[];
let container;
const command=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function freePort(port){
 await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error(`Port ${port} is occupied. Stop its local dev/test server before running checks; existing servers are never reused.`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});
}
async function run(name,cmd,args,extra={}){
 console.log(`\n▶ ${name}`);
 const start=Date.now(),log=path.join(dir,`${String(results.length+1).padStart(2,'0')}-${name}.log`),stream=createWriteStream(log);
 const stepEnv={...env,...extra};
 for(const key of Object.keys(stepEnv))if(stepEnv[key]===null)delete stepEnv[key];
 const child=spawn(cmd,args,{env:stepEnv,stdio:['ignore','pipe','pipe']});
 for(const output of [child.stdout,child.stderr])output.on('data',data=>{stream.write(data);process.stdout.write(data)});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
 await new Promise(resolve=>stream.end(resolve));
 results.push({name,code,seconds:Math.round((Date.now()-start)/1000),log:path.relative(process.cwd(),log)});
 writeFileSync(path.join(dir,'summary.json'),JSON.stringify({success:code===0,results},null,2));
 if(code!==0)throw Error(`${name} failed (${code}). See ${log}`);
}
try{
 for(const port of [8787,8788,8792])await freePort(port);
 command('cargo',['llvm-cov','--version']);
 if(ci){
  const url=new URL(process.env.TEST_DATABASE_URL||'');
  if(!(process.env.WHISPER_CHECK_CONTAINER==='1'?['postgres']:['localhost','127.0.0.1']).includes(url.hostname)||url.pathname!=='/hush_test')throw Error('CI requires a loopback disposable hush_test database.');
  env.TEST_DATABASE_URL=url.href;
 }else{
  // Always create a fresh database. Ignore caller DB URLs, including production.
  container=`whisper-check-${process.pid}-${Date.now()}`;
  command('docker',['run','--detach','--rm','--name',container,'-e','POSTGRES_USER=postgres','-e','POSTGRES_PASSWORD=test-only','-e','POSTGRES_DB=hush_test','-p','127.0.0.1::5432','postgres:17']);
  const port=command('docker',['port',container,'5432/tcp']).split(':').at(-1);
  env.TEST_DATABASE_URL=`postgresql://postgres:test-only@127.0.0.1:${port}/hush_test`;
  let ready=false;
  for(let i=0;i<60;i++){try{command('docker',['exec',container,'pg_isready','-U','postgres']);ready=true;break}catch{await new Promise(resolve=>setTimeout(resolve,500))}}
  if(!ready)throw Error('Disposable PostgreSQL did not become ready.');
 }
 await run('dependencies','npm',['ci']);
 const versions={node:process.version,platform:process.platform,arch:process.arch,rust:command('rustc',['--version']),coverage:command('cargo',['llvm-cov','--version']),pinnedBrowser:env.WHISPER_PINNED_BROWSER==='1',browsers:JSON.parse(readFileSync('node_modules/playwright-core/browsers.json','utf8')).browsers.filter(browser=>browser.name.startsWith('chromium'))};
 console.log('Check environment:',JSON.stringify(versions));
 writeFileSync(path.join(dir,'environment.json'),JSON.stringify(versions,null,2));
 await run('typecheck','npm',['run','typecheck']);
 await run('client-build','npm',['run','build:client']);
 await run('rust-format','cargo',['fmt','--check']);
 await run('rust-clippy','cargo',['clippy','--locked','--all-targets','--','-D','warnings']);
 await run('rust-sqlite','cargo',['test','--locked'],{TEST_DATABASE_URL:null});
 await run('rust-postgres','cargo',['test','--locked']);
 await run('rust-coverage','cargo',['llvm-cov','--locked','--summary-only','--ignore-filename-regex','tests/|src/main.rs','--fail-under-lines','95'],{TEST_DATABASE_URL:null});
 await run('unit','npm',['test']);
 await run('edge-api','npm',['run','test:edge']);
 await run('public-build','npm',['run','build:beta']);
 await run('music','npm',['run','test:music']);
 rmSync('coverage/browser-raw',{recursive:true,force:true});
 rmSync('coverage/browser.db',{force:true});
 await run('browser-rust','npm',['run','test:browser'],{TEST_DATABASE_URL:null});
 const edge={EDGE_TEST_BASE:'http://localhost:8788'};
 await run('browser-edge','npx',['playwright','test','--grep','create → explicit|PIN prompt|five wrong|timed links|two recipient|mobile compose|optional rich|real MediaRecorder|anonymous create quota'],edge);
 // Playwright owns a fresh bridge for EACH suite: no stale assets/rate budgets.
 await run('browser-chat','npx',['playwright','test','-c','playwright.chat.config.js'],{CHAT_TESTS:'1'});
 await run('browser-music-edge','npx',['playwright','test','tests/browser/music-sharing.spec.js'],edge);
 console.log(`\nPASS: all ${results.length} checks. Report: ${path.relative(process.cwd(),dir)}`);
}catch(error){console.error(error.message);process.exitCode=1}
finally{if(container){try{command('docker',['rm','--force',container])}catch{console.error('Could not remove disposable container:',container);process.exitCode=1}}}
