import {test,expect} from '@playwright/test';

test('prerendered shell waits for controller readiness and hydrates without errors',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/app.js',async route=>{await gate;await route.continue();});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#root')).toHaveAttribute('inert','');
  await expect(page.locator('#message')).toBeAttached();
  release();await expect(page.locator('#root')).not.toHaveAttribute('inert','');
  await page.locator('#message').fill('Ready');await page.locator('#create').click();
  await expect(page.locator('#settings')).toBeVisible();expect(errors).toEqual([]);
 }finally{release();}
});
