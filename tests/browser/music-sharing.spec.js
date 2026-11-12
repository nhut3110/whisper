import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const shortVoice=readFileSync('tests/fixtures/voice.wav'),voice=Buffer.concat([shortVoice.subarray(0,44),...Array(30).fill(shortVoice.subarray(44))]);voice.writeUInt32LE(voice.length-8,4);voice.writeUInt32LE(voice.length-44,40);
test.beforeEach(async({page})=>{
 test.skip(!process.env.EDGE_TEST_BASE,'Integrated music uses the hosted gateway/Edge bridge.');
 await page.route('**/music-beta/search?*',r=>r.fulfill({json:{tracks:[{id:3135556,title:'Never Gonna Give You Up',artist:'Rick Astley',preview:'https://test.dzcdn.net/preview.wav',cover:null,url:'https://www.deezer.com/track/3135556'}]}}));
 await page.route('https://test.dzcdn.net/preview.wav',r=>r.fulfill({contentType:'audio/wav',body:voice}));
});
async function choose(page){
 await page.goto('/');await page.locator('#music-mode').click();
 const frame=page.frameLocator('#music-frame');await frame.locator('#query').fill('rick');await frame.locator('#submit').click();await frame.locator('#results button').click();return frame;
}
async function solve(page){
 await expect(page.locator('#challenge-label')).not.toHaveText('Đang chuẩn bị…');await page.waitForTimeout(550);
 const n=Number((await page.locator('#challenge-label').textContent()).match(/\d+/)[0]),r=await page.locator('#wake-track').boundingBox();
 await page.mouse.move(r.x,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*n/100,r.y+r.height/2,{steps:8});await page.mouse.up();const response=page.waitForResponse(r=>r.url().endsWith('/api/messages')&&r.request().method()==='POST');await page.locator('#settings-done').click();const result=await response;expect(result.ok(),result.ok()?'Created':await result.text()).toBe(true);
}
test('music reference is encrypted, shared, freshly resolved, played and burned',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let payload='';page.on('request',r=>{if(r.url().endsWith('/api/messages'))payload=r.postData();});
 const frame=await choose(page);await expect(page.locator('#share-music')).toBeVisible();await page.locator('#share-music').click();await solve(page);await expect(page.locator('#created')).toBeVisible();
 expect(payload).not.toContain('3135556');expect(payload).not.toContain('Rick');
 const link=await page.locator('#share-link').inputValue();await page.goto(link);await page.locator('#create').click();await page.locator('#open').click();await expect(page.locator('#reading')).toBeVisible();
 await expect(frame.locator('#title')).toHaveText('Never Gonna Give You Up');await expect(frame.locator('#intro-line')).toBeHidden({timeout:6000});await expect(frame.locator('#selected')).toHaveAttribute('data-intro','ready',{timeout:3000});
 if(await frame.locator('#audio').evaluate(a=>a.paused))await frame.locator('#play-toggle').click();await expect(frame.locator('#selected')).toHaveClass(/is-playing/);await expect(page.locator('#copy-all')).toBeHidden();
 await page.screenshot({path:'test-results/music-integrated-desktop.png',fullPage:true});
 await page.locator('#close-music').click();await expect.poll(()=>frame.locator('#audio').evaluate(a=>a.paused)).toBe(true);await page.locator('#clear').click();await expect(page.locator('#ended')).toBeVisible();await expect(page.locator('#music-stage')).toBeHidden();
 await page.goto(link);await expect(page.locator('#ended')).toBeVisible();expect(errors).toEqual([]);
});
test('mobile layout and mode switching pause playback and preserve text draft',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#message').fill('Bản nháp');await page.locator('#music-mode').click();
 const frame=page.frameLocator('#music-frame');await frame.locator('#query').fill('rick');await frame.locator('#submit').click();await frame.locator('#results button').click();await expect(frame.locator('#intro-line')).toBeHidden({timeout:3000});
 // Wait for the scheduled autoplay attempt before deciding whether a manual
 // click is needed; otherwise autoplay can start between the read and click,
 // turning that click into Pause on faster CI runners.
 await expect(frame.locator('#selected')).toHaveAttribute('data-intro','ready');
 if(await frame.locator('#audio').evaluate(a=>a.paused))await frame.locator('#play-toggle').click();await expect(frame.locator('#selected')).toHaveClass(/is-playing/);
 await page.screenshot({path:'test-results/music-integrated-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await frame.locator('html').evaluate(e=>e.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#text-mode').click();await expect(page.locator('#message')).toHaveValue('Bản nháp');await expect.poll(()=>frame.locator('#audio').evaluate(a=>a.paused)).toBe(true);await expect(page.locator('#share-dock')).toBeVisible();
 await page.locator('#audio-mode').click();await expect(page.locator('#voice-stage')).toBeVisible();await page.locator('#music-mode').click();await expect(page.locator('#music-stage')).toBeVisible();
});
