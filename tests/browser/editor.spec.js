import {test,expect} from '@playwright/test';
test('slash picker lazy loads, searches, accepts keyboard selection and preserves headings on share',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const assets=[];page.on('request',r=>assets.push(r.url()));
 await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');
 expect(assets.some(url=>/\/assets\/editor-[^/]+\.js|\/editor\.ts(?:\?|$)/.test(url))).toBe(false);
 await page.locator('#message').fill('/heading');await expect(page.locator('#block-picker')).toBeVisible();
 await expect(page.getByRole('option',{name:'H₁ Tiêu đề 1'})).toBeVisible();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.locator('#rich-editor')).toBeVisible();
 await page.keyboard.type('Một lời nhắn');await expect(page.locator('#rich-editor h2')).toHaveText('Một lời nhắn');
 await page.locator('#create').click();await expect(page.locator('#rich-mode')).toBeChecked();await page.locator('#settings-close').click();
 await expect(page.locator('#rich-editor h2')).toHaveText('Một lời nhắn');
 await page.locator('#create').click();await expect(page.locator('#verify-body')).toBeVisible();
 const target=Number((await page.locator('#challenge-label').textContent()).match(/\d+/)[0]);await page.locator('#wake-track').focus();await page.keyboard.press('Home');for(let i=0;i<target;i++)await page.keyboard.press('ArrowRight');await page.waitForTimeout(550);await page.locator('#settings-done').click();await expect(page.locator('#created')).toBeVisible();
 const link=await page.locator('#share-link').inputValue();await page.goto(link);await expect(page.locator('#receive')).toBeVisible();await page.locator('#create').click();await page.locator('#open').click();await expect(page.locator('#plaintext h2')).toHaveText('Một lời nhắn');expect(errors).toEqual([]);
});
test('markdown shortcuts and selection toolbar preserve text; IME input does not trigger commands',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('#');await expect(page.locator('#text-editor')).toHaveAttribute('data-enhanced','');await page.keyboard.press('Space');
 await expect(page.locator('#rich-editor')).toBeVisible();await page.keyboard.type('Hello');await expect(page.locator('#rich-editor h1')).toHaveText('Hello');
 await page.locator('#rich-editor').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e.querySelector('h1'));getSelection().removeAllRanges();getSelection().addRange(r)});
 await expect(page.locator('#rich-toolbar')).toBeVisible();await page.getByRole('button',{name:'In nghiêng',exact:true}).click();await expect(page.locator('#rich-editor h1')).toHaveText('Hello');await expect(page.locator('#rich-editor :is(i,em)')).toHaveText('Hello');
 await page.reload();await page.locator('#message').fill('/');await expect(page.locator('#block-picker')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#block-picker')).toBeHidden();await expect(page.locator('#message')).toHaveValue('/');
 await page.locator('#message').dispatchEvent('compositionstart');await page.locator('#message').fill('/h');await expect(page.locator('#block-picker')).toBeHidden();await page.locator('#message').dispatchEvent('compositionend');await expect(page.locator('#block-picker')).toBeVisible();
});
test('mobile add-block menu stays inside viewport and leaves draft on cancel',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.goto('/');await page.locator('#message').fill('Hello');await page.locator('#insert-block').click();await expect(page.locator('#block-picker')).toBeVisible();
 const box=await page.locator('#block-picker').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.y+box.height).toBeLessThanOrEqual(740);
 await page.keyboard.press('Escape');await expect(page.locator('#message')).toHaveValue('Hello\n/');
});

test('selection in plain text upgrades only on formatting and retains surrounding content',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('before selected after');await expect(page.locator('#text-editor')).toHaveAttribute('data-enhanced','');
 await page.locator('#message').evaluate(e=>{e.focus();e.setSelectionRange(7,15);e.dispatchEvent(new Event('select',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'))});
 await expect(page.locator('#rich-toolbar')).toBeVisible();await page.getByRole('button',{name:'In nghiêng',exact:true}).click();
 await expect(page.locator('#rich-editor')).toHaveText('before selected after');await expect(page.locator('#rich-editor :is(i,em)')).toHaveText('selected');
});
test('typing while formatting code loads retains the newly typed text',async({page})=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/rich.js',async route=>{await gate;await route.continue()});
 try{
  await page.goto('/');await page.locator('#message').fill('/heading');await expect(page.locator('#block-picker')).toBeVisible();
  await page.getByRole('option',{name:'H₂ Tiêu đề 2'}).click();await page.keyboard.type('Keep this');release();
  await expect(page.locator('#rich-editor h2')).toHaveText('Keep this');await page.keyboard.type(' safe');await expect(page.locator('#rich-editor h2')).toHaveText('Keep this safe');
 }finally{release()}
});
