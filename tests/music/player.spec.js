import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const voice=readFileSync('tests/fixtures/voice.wav');
async function pick(page){
 await page.route('**/api/search?*',r=>r.fulfill({json:{tracks:[{id:1,title:'Test song',artist:'Test artist',preview:'https://test.dzcdn.net/preview.wav',cover:null,url:'https://www.deezer.com/track/1'}]}}));
 await page.route('https://test.dzcdn.net/preview.wav',r=>r.fulfill({contentType:'audio/wav',body:voice}));
 await page.goto('/');await page.locator('#query').fill('test');await page.locator('#submit').click();await page.locator('#results button').click();
}
test('intro gives way to record; playback, mic and dance follow real media state',async({page})=>{
 await pick(page);await expect(page.locator('#intro-line')).toBeVisible();
 await expect(page.locator('.record-scene')).toBeHidden();
 expect(await page.evaluate(()=>document.querySelector('#intro-line').getBoundingClientRect().bottom < document.querySelector('#music-bot').getBoundingClientRect().top)).toBe(true);
 await expect(page.locator('#intro-line')).toBeHidden({timeout:6000});
 await expect(page.locator('#selected')).toHaveAttribute('data-intro','ready');
 // Explicit gesture works even when the browser refuses delayed autoplay.
 if(await page.locator('#audio').evaluate(a=>a.paused))await page.locator('#play-toggle').click();
 await expect(page.locator('#selected')).toHaveClass(/is-playing/);
 await expect(page.locator('#music-bot')).toHaveAttribute('data-gear','singing');
 await expect(page.locator('.performing-gear')).toBeVisible();await expect(page.locator('.headband')).toBeVisible();
 await page.locator('#play-toggle').click();await expect(page.locator('#selected')).not.toHaveClass(/is-playing/);
 await page.locator('#play-toggle').click();await expect(page.locator('#selected')).toHaveClass(/is-playing/);
 await page.locator('#audio').evaluate(a=>{a.currentTime=a.duration-.04;});await expect(page.locator('#selected')).not.toHaveClass(/is-playing/);
});
test('leaving during intro cancels delayed playback and old animations',async({page})=>{
 await pick(page);await page.locator('#back').click();await page.waitForTimeout(3000);
 await expect(page.locator('#library')).toBeVisible();expect(await page.locator('#audio').evaluate(a=>a.paused&&!a.hasAttribute('src'))).toBe(true);
 await page.locator('#results button').click();await page.locator('#recipient-preview').click();await expect(page.locator('#intro-line')).toBeVisible();
 await page.locator('#back').click();await page.locator('#back').click();await page.waitForTimeout(3000);
 expect(await page.locator('#audio').evaluate(a=>a.paused)).toBe(true);
});
test('mobile reduced-motion stage fits and retains click-to-play',async({page})=>{
 await page.setViewportSize({width:320,height:640});await page.emulateMedia({reducedMotion:'reduce'});await pick(page);
 await expect(page.locator('#intro-line')).toBeHidden({timeout:3000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('.record-spin').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await page.locator('#recipient-preview').click();await expect(page.locator('#intro-line')).toBeVisible();
});
