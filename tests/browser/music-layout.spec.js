import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const clip=readFileSync('tests/fixtures/voice.wav');
test.beforeEach(async({page})=>{
 await page.route('**/music-beta/search?*',r=>r.fulfill({json:{tracks:[{id:1,title:'Test song',artist:'Test artist',preview:'https://test.dzcdn.net/preview.wav',cover:null,url:'https://www.deezer.com/track/1'}]}}));
 await page.route('https://test.dzcdn.net/preview.wav',r=>r.fulfill({contentType:'audio/wav',body:clip}));
 await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');test.skip(await page.locator('#music-mode').isHidden(),'Music is absent from the standalone Rust build.');
});
for(const viewport of [{width:1280,height:800},{width:390,height:844}])test(`music keeps the shared mascot and only scrolls when content needs it at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);await page.locator('#music-mode').click();const frame=page.frameLocator('#music-frame');await expect(frame.locator('#submit')).toBeEnabled();
 await expect(page.locator('#create')).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 expect(await frame.locator('html').evaluate(e=>e.scrollHeight<=innerHeight)).toBe(true);
 const bot=await page.locator('#create').elementHandle();
 await frame.locator('#query').fill('test');await frame.locator('#submit').click();await frame.locator('#results button').click();
 await expect(page.locator('#share-dock')).toHaveClass(/music-performer/);await expect(frame.locator('#music-bot')).toBeHidden();await expect(page.locator('#create')).toHaveAttribute('data-gear','singing');
 await expect(frame.locator('#selected')).toHaveAttribute('data-intro','ready',{timeout:6000});await page.waitForTimeout(700);
 expect(await page.locator('#create').evaluate((e,original)=>e===original,bot)).toBe(true);
 const r=await page.locator('#create').boundingBox();const anchor=await frame.locator('#music-bot').boundingBox();expect(Math.abs(r.y-anchor.y)).toBeLessThan(3);
 expect(r.x).toBeGreaterThan(0);expect(r.y+r.height).toBeLessThan(viewport.height);
 expect(await frame.locator('html').evaluate(e=>e.scrollHeight<=innerHeight)).toBe(true);
 await frame.locator('#back').click();await expect(page.locator('#share-dock')).not.toHaveClass(/music-performer/);
 await page.locator('#audio-mode').click();await expect(page.locator('#voice-stage')).toBeVisible();await page.waitForTimeout(150);const before=await page.locator('#create').boundingBox();
 await page.locator('#music-mode').click();await page.waitForTimeout(130);const after=await page.locator('#create').boundingBox();expect(Math.hypot(after.x-before.x,after.y-before.y)).toBeLessThan(viewport.width*.65);
 await expect(page.locator('#create')).toBeVisible();await page.locator('#text-mode').click();await expect(page.locator('#message')).toBeVisible();
});
test('theme reveal synchronizes the embedded palette, preserves draft and respects reduced motion',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#message').fill('Keep this draft');await page.locator('#music-mode').click();const frame=page.frameLocator('#music-frame');await expect(frame.locator('#submit')).toBeEnabled();
 const old=await page.locator('html').getAttribute('data-theme');await page.locator('#theme-toggle').click();await expect(page.locator('body')).toHaveClass(/theme-casting/);
 await expect(page.locator('html')).toHaveAttribute('data-theme',old==='dark'?'light':'dark');await expect(frame.locator('html')).toHaveAttribute('data-theme',old==='dark'?'light':'dark');await expect(page.locator('body')).not.toHaveClass(/theme-casting/);
 expect(await frame.locator('.search-row').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(old==='dark'?'rgb(243, 243, 243)':'rgb(32, 32, 30)');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme',old);await expect(frame.locator('html')).toHaveAttribute('data-theme',old);await expect(page.locator('body')).not.toHaveClass(/theme-casting/);
 await page.locator('#text-mode').click();await expect(page.locator('#message')).toHaveValue('Keep this draft');expect(errors).toEqual([]);
});
