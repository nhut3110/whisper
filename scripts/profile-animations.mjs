// Reproducible local CPU-throttled comparison. This is not a physical-device benchmark.
import {chromium} from '@playwright/test';import config from '../playwright.config.js';import {execFileSync} from 'node:child_process';import {writeFile,readFile} from 'node:fs/promises';
const browser=await chromium.launch(config.use.launchOptions),results=[];
try{for(const baseline of [true,false]){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'vi-VN'}),page=await context.newPage();
 for(const file of ['interactions.js','audio.js','style.css']){
  const source=baseline?execFileSync('git',['show',`HEAD:web/${file}`],{env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}):await readFile(`web/${file}`);
  await page.route(`**/${file}`,r=>r.fulfill({contentType:file.endsWith('css')?'text/css':'text/javascript',body:source}));
 }
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});await cdp.send('Performance.enable');
 await page.goto('http://localhost:8787');await page.waitForTimeout(1000);
 await page.evaluate(()=>{window.profile={frames:[],longTasks:[]};let last=performance.now();function frame(now){profile.frames.push(now-last);last=now;window.profileFrame=requestAnimationFrame(frame);}window.profileFrame=requestAnimationFrame(frame);window.profileObserver=new PerformanceObserver(list=>profile.longTasks.push(...list.getEntries().map(e=>e.duration)));profileObserver.observe({type:'longtask'});});
 const before=(await cdp.send('Performance.getMetrics')).metrics;
 for(let i=0;i<90;i++){
  if(i%10===0)await page.locator(i%20===0?'#audio-mode':'#text-mode').click();
  await page.mouse.move(12+(i*37)%365,50+(i*61)%730);await page.waitForTimeout(95);
 }
 const after=(await cdp.send('Performance.getMetrics')).metrics;
 const data=await page.evaluate(()=>{cancelAnimationFrame(profileFrame);profileObserver.disconnect();const f=profile.frames.slice(2).sort((a,b)=>a-b);return {samples:f.length,frameP95Ms:f[Math.floor(f.length*.95)],framesOver33ms:f.filter(x=>x>33.4).length,longTasks:profile.longTasks.length,longTaskMaxMs:Math.max(0,...profile.longTasks)};});
 for(const name of ['LayoutCount','LayoutDuration','RecalcStyleCount','ScriptDuration','TaskDuration'])data[name]=after.find(x=>x.name===name).value-before.find(x=>x.name===name).value;
 results.push({version:baseline?'HEAD before optimization':'working tree optimized',cpuSlowdown:6,...data});await context.close();
}await writeFile('/tmp/whisper-animation-profile.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
