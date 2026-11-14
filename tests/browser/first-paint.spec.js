import {test,expect} from '@playwright/test';
// Exercise the server-rendered shell while the application JS is still downloading.
// This catches the dev-only flash too: Vite's JS CSS import used to arrive too late.
for(const path of ['/', '/s/'+'a'.repeat(16)+'#'+'A'.repeat(22)])for(const width of [390,1280])test(`first paint stays styled before hydration at ${width}px on ${path.split('#')[0]}`,async({page})=>{
 await page.setViewportSize({width,height:844});
 let release;const held=new Promise(resolve=>{release=resolve});
 await page.route('**/*',async route=>{const request=route.request();if(request.resourceType()==='script'&&/\/(?:main\.tsx|assets\/index\.js)(?:\?|$)/.test(request.url()))await held;await route.continue()});
 try{
  await page.goto(path,{waitUntil:'commit'});
  const logo=page.locator('.brand-mark');await expect(logo).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert','');
  await expect(page.locator('head link[rel=stylesheet]')).toHaveCount(1);
  await expect.poll(()=>logo.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))).toEqual({width:40,height:32});
  expect(await page.locator('.site-header').evaluate(el=>getComputedStyle(el).display)).toBe('flex');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({path:`coverage/manual/2026-11-13-sharing/first-paint-${width}.png`});
  release();await expect(page.locator('#root')).not.toHaveAttribute('inert','');
  const rect=await logo.boundingBox();expect(rect.width).toBe(40);expect(rect.height).toBe(32);
 }finally{release()}
});
