import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {decodeFrame} from '../../frontend/optical/decoder.ts';
const demo=origin=>origin+'/s/'+'a'.repeat(16)+'#'+'A'.repeat(22);
async function ready(page){await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','')}
async function create(page){await page.locator('#create').click();await expect(page.locator('#challenge-label')).toContainText(/\d/);await page.waitForTimeout(550);const target=Number((await page.locator('#challenge-label').textContent()).match(/\d+/)[0]),r=await page.locator('#wake-track').boundingBox();await page.mouse.move(r.x,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*target/100,r.y+r.height/2,{steps:8});await page.mouse.up();await page.locator('#settings-done').click();await expect(page.locator('#created')).toBeVisible();return page.locator('#share-link').inputValue()}
async function receiver(browser,url){const context=await browser.newContext({locale:'vi-VN'}),page=await context.newPage();await page.goto(url);await expect(page.locator('#receive')).toBeVisible();await page.locator('#create').click();await page.locator('#open').click();await expect(page.locator('#plaintext')).toBeVisible();return {context,page}}
function decode(data){return decodeFrame(new Uint8ClampedArray(data),480,480)}
test('shared panel exports scannable PNG and animated GIF in both themes',async({page})=>{
 test.setTimeout(90000);await ready(page);const url=demo(new URL(page.url()).origin);
 for(const theme of ['dark','light']){
  await page.evaluate(({url,theme})=>{document.documentElement.dataset.theme=theme;document.dispatchEvent(new CustomEvent('whisper:optical',{detail:{mode:'share',url}}))},{url,theme});
  await page.getByRole('button',{name:'Link',exact:true}).click();await expect(page.locator('.optical-link input')).toHaveValue(url);
  await page.getByRole('button',{name:'Tinh vân',exact:true}).click();await expect(page.locator('.optical-art')).toHaveAttribute('data-tone',theme);await page.waitForTimeout(1100);
  let pending=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();let file=await pending;let buffer=await fs.readFile(await file.path());let raw=await sharp(buffer).ensureAlpha().raw().toBuffer();expect(decode(raw)).toBe('S'+'a'.repeat(16)+'A'.repeat(22));
  pending=page.waitForEvent('download');await page.getByRole('button',{name:'GIF',exact:true}).click();file=await pending;buffer=await fs.readFile(await file.path());const meta=await sharp(buffer,{animated:true}).metadata();expect(meta.pages).toBe(32);
  for(const n of [0,15,31]){raw=await sharp(buffer,{page:n}).ensureAlpha().raw().toBuffer();expect(decode(raw)).toBe('S'+'a'.repeat(16)+'A'.repeat(22));}
  await fs.mkdir('coverage/manual/2026-11-13-sharing',{recursive:true});await fs.writeFile(`coverage/manual/2026-11-13-sharing/nebula-${theme}.gif`,buffer);await page.screenshot({path:`coverage/manual/2026-11-13-sharing/nebula-${theme}.png`});await page.keyboard.press('Escape');
 }
});
test('plain and rich message spoilers keep secrets out of DOM and clipboard before reveal',async({page,browser})=>{
 await ready(page);
 for(const rich of [false,true,'markdown']){
  await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');await page.locator('#message').fill('Public secret-UNIQUEx end');
  if(rich===true){await page.locator('#message').evaluate(el=>{el.focus();el.setSelectionRange(7,21);el.dispatchEvent(new Event('select',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'))});await page.getByRole('button',{name:'Spoiler',exact:true}).click();await expect(page.locator('#rich-editor [data-spoiler]')).toHaveText('secret-UNIQUEx');}
  else await page.locator('#message').fill(rich==='markdown'?'**Public** ||**secret-UNIQUEx**|| end':'Public ||secret-UNIQUEx|| end');
  const url=await create(page);const second=await receiver(browser,url);
  try{const p=second.page;await expect(p.locator('.whisper-spoiler')).toHaveCount(1);expect((await p.locator('.whisper-spoiler').boundingBox()).height).toBeLessThan(25);expect(await p.locator('body').innerHTML()).not.toContain('secret-UNIQUEx');await second.context.grantPermissions(['clipboard-read','clipboard-write']);await p.locator('#copy-all').click();await expect.poll(()=>p.evaluate(()=>navigator.clipboard.readText())).toContain('[•••]');expect(await p.evaluate(()=>navigator.clipboard.readText())).not.toContain('secret-UNIQUEx');
   await p.screenshot({path:`coverage/manual/2026-11-13-sharing/spoiler-${rich?'rich':'plain'}.png`});await p.locator('.whisper-spoiler').focus();await p.keyboard.press('Enter');await expect(p.locator('#plaintext')).toContainText('secret-UNIQUEx');await p.locator('#copy-all').click();await expect.poll(()=>p.evaluate(()=>navigator.clipboard.readText())).toContain('secret-UNIQUEx');
  }finally{await second.context.close()}
 }
});
test('chat selected spoiler suppresses link preview, reply and copy until click',async({page,browser,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/?mode=chat');await page.locator('#chat-name').fill('Host');await page.getByRole('button',{name:'Tạo phòng',exact:true}).click();await expect(page.locator('.chat-room')).toBeVisible();
 const s=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('whisper-chat-session')));const second=await browser.newContext({locale:'vi-VN'}),p=await second.newPage();await second.grantPermissions(['clipboard-read','clipboard-write']);const requests=[];p.on('request',r=>requests.push(r.url()));
 try{await p.goto(`${new URL(page.url()).origin}/?mode=chat#r=${s.id}&a=${s.access}&k=${s.key}`);await p.locator('#chat-name').fill('Guest');await p.getByRole('button',{name:'Vào phòng',exact:true}).click();await expect(p.locator('.chat-room')).toBeVisible();
  const box=page.locator('.chat-emoji-composer');await box.fill('https://private.example/secretXYZ');await box.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new Event('pointerup',{bubbles:true}))});await page.getByRole('button',{name:'Spoiler',exact:true}).click();await expect(box).toHaveText('||https://private.example/secretXYZ||');await page.getByRole('button',{name:'Gửi',exact:true}).click();await expect(p.locator('.whisper-spoiler')).toHaveCount(1);expect(await p.locator('body').innerHTML()).not.toContain('secretXYZ');expect(requests.some(url=>url.includes('/preview'))).toBe(false);
  await p.locator('.chat-message [data-slot=bubble-content]').first().hover();await p.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).click();await p.getByRole('menuitem',{name:'Copy nội dung',exact:true}).click();await expect.poll(()=>p.evaluate(()=>navigator.clipboard.readText())).toBe('[•••]');await p.locator('.chat-message [data-slot=bubble-content]').first().hover();await p.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).click();await p.getByRole('menuitem',{name:'Trả lời',exact:true}).click();await expect(p.locator('.chat-compose-context')).toContainText('[•••]');expect(await p.locator('body').innerHTML()).not.toContain('secretXYZ');
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:'coverage/manual/2026-11-13-sharing/chat-spoiler-mobile.png'});await p.locator('.whisper-spoiler').click();await expect(p.locator('.chat-message-text')).toContainText('https://private.example/secretXYZ');await expect(p.locator('.spoiler-piece')).toHaveCount(0);
 }finally{await second.close()}
});

test('dust wraps in the text flow, has no box or plaintext and respects reduced motion',async({page})=>{
 await ready(page);await page.setViewportSize({width:390,height:844});
 const secret='A private sentence with enough words to wrap naturally across several lines on a small phone.';
 await page.evaluate(async secret=>{const {protectSpoilers}=await import('/spoiler.js');const root=document.getElementById('plaintext');document.getElementById('compose').hidden=true;document.getElementById('reading').hidden=false;root.textContent='Hello ||'+secret+'|| end';protectSpoilers(root)},secret);
 const hidden=page.locator('.whisper-spoiler');await expect(hidden).toBeVisible();
 expect(await hidden.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 expect(await page.locator('body').innerHTML()).not.toContain(secret);
 const lines=await page.locator('.spoiler-piece').evaluateAll(nodes=>new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().y))).size);expect(lines).toBeGreaterThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 const canvas=page.locator('.spoiler-particle-layer');await expect(canvas).toBeVisible();const first=await canvas.evaluate(el=>el.toDataURL());await page.waitForTimeout(140);expect(await canvas.evaluate(el=>el.toDataURL())).not.toBe(first);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(60);const still=await canvas.evaluate(el=>el.toDataURL());await page.waitForTimeout(140);expect(await canvas.evaluate(el=>el.toDataURL())).toBe(still);
 await hidden.focus();await page.keyboard.press('Enter');await expect(page.locator('#plaintext')).toContainText(secret);await expect(page.locator('.spoiler-piece')).toHaveCount(0);
});

test('editor previews real particles, click edits, Escape conceals and undo keeps the draft',async({page})=>{
 await ready(page);await page.locator('#message').fill('Public a very private sentence end');await expect(page.locator('#text-editor')).toHaveAttribute('data-enhanced','');
 await page.locator('#message').evaluate(el=>{el.focus();el.setSelectionRange(7,30);document.dispatchEvent(new Event('selectionchange'))});await page.getByRole('button',{name:'Spoiler',exact:true}).click();
 const mark=page.locator('#rich-editor [data-spoiler]');await expect(mark).toHaveText('a very private sentence');await expect(mark).not.toHaveClass(/spoiler-editing/);await expect(page.locator('.spoiler-particle-layer')).toHaveCount(1);
 await page.evaluate(async()=>{const {protectSpoilers}=await import('/spoiler.js');const el=document.createElement('div');el.id='particle-qa-copy';el.textContent='||Another hidden line||';document.body.append(el);protectSpoilers(el)});await expect(page.locator('.spoiler-particle-layer')).toHaveCount(1);await page.locator('#particle-qa-copy').evaluate(el=>el.remove());
 const visible=await mark.evaluate(el=>getComputedStyle(el).color);expect(visible).toBe('rgba(0, 0, 0, 0)');
 await mark.click();await expect(mark).toHaveClass(/spoiler-editing/);await page.keyboard.insertText('X');await expect(mark).toContainText('X');await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await expect(mark).toHaveText('a very private sentence');await page.keyboard.press('Escape');await expect(mark).not.toHaveClass(/spoiler-editing/);
 await expect(page.locator('#rich-editor')).toHaveText('Public a very private sentence end');
 await page.screenshot({path:'coverage/manual/2026-11-13-sharing/particles-editor.png'});
 await page.locator('#rich-editor').focus();await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await expect(mark).toHaveCount(0);await expect(page.locator('#rich-editor')).toHaveText('Public a very private sentence end');
});

for(const width of [390,1280])test(`spoiler keeps text baseline and gutter outside the paragraph at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await ready(page);
 const text='xin chào bạn tôi ở đây\nMột dòng thứ hai để kiểm tra vị trí.\nDòng thứ ba vẫn giữ nguyên.';
 await page.locator('#message').fill(text);
 const before=await page.locator('#message').evaluate(el=>{
  const s=getComputedStyle(el),r=el.getBoundingClientRect(),mirror=document.createElement('div');
  mirror.style.cssText=`position:fixed;visibility:hidden;left:${r.x}px;top:${r.y}px;width:${r.width}px;white-space:pre-wrap;overflow-wrap:anywhere`;
  for(const k of ['font','lineHeight','letterSpacing','padding','border','boxSizing'])mirror.style[k]=s[k];
  mirror.textContent=el.value;document.body.append(mirror);const range=document.createRange();range.selectNodeContents(mirror);const lines=[...range.getClientRects()].map(r=>({x:r.x,y:r.y}));mirror.remove();
  el.focus();el.setSelectionRange(8,20);document.dispatchEvent(new Event('selectionchange'));
  return {lines,scrollY,rect:{x:r.x,y:r.y}};
 });
 await page.getByRole('button',{name:'Spoiler',exact:true}).click();const rich=page.locator('#rich-editor'),mark=rich.locator('[data-spoiler]');await expect(mark).toHaveCount(1);
 const after=await rich.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {lines:[...range.getClientRects()].filter(r=>r.width>0).map(r=>({x:r.x,y:r.y})),scrollY,rect:{x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y},lineHeight:getComputedStyle(el).lineHeight}});
 expect(after.scrollY).toBe(before.scrollY);expect(after.rect).toEqual(before.rect);
 const rows=[...new Set(after.lines.map(r=>r.y))];for(const row of before.lines)expect(rows.some(y=>Math.abs(y-row.y)<1)).toBe(true);
 await mark.hover();await page.waitForTimeout(100);const gutter=await page.locator('#block-gutter').boundingBox(),editor=await rich.boundingBox();
 expect(gutter.x+gutter.width).toBeLessThanOrEqual(editor.x);
 expect(Math.abs(gutter.y-rows[0])).toBeLessThan(8);
 expect((await rich.innerText()).replace(/\u200b/g,'')).toBe(text);
 await page.screenshot({path:`coverage/manual/2026-11-13-sharing/spoiler-layout-${width}.png`});
});

for(const exit of ['automatic','ArrowRight','Escape'])test(`typing after spoiler stays public after ${exit}`,async({page})=>{
 await ready(page);await page.locator('#message').fill('Hello secret');
 await page.locator('#message').evaluate(el=>{el.focus();el.setSelectionRange(6,12);document.dispatchEvent(new Event('selectionchange'))});
 await page.getByRole('button',{name:'Spoiler',exact:true}).click();
 const rich=page.locator('#rich-editor'),mark=rich.locator('[data-spoiler]');
 if(exit!=='automatic'){
  await mark.click();await page.evaluate(()=>{const el=document.querySelector('#rich-editor [data-spoiler]'),range=document.createRange();range.selectNodeContents(el);range.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(range)});
  await page.keyboard.press(exit);
 }
 await page.keyboard.insertText(' next');
 await expect(mark).toHaveText('secret');
 expect((await rich.innerText()).replace(/\u200b/g,'').replace(/\u00a0/g,' ')).toBe('Hello secret next');
 const html=await rich.evaluate(async el=>(await import('/rich.js')).clean(el.innerHTML));
 expect(html).toContain('<span data-spoiler="">secret</span>');expect(html).toContain(' next');expect(html).not.toContain('\u200b');expect(html).not.toContain('data-spoiler-caret');
 // Composition input and paste use the same neutral host, without key interception.
 await rich.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));document.execCommand('insertText',false,' tiếng Việt');el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))});
 await expect(mark).toHaveText('secret');expect((await rich.innerText()).replace(/\u200b/g,'').replace(/\u00a0/g,' ')).toBe('Hello secret next tiếng Việt');
});

for(const platform of ['MacIntel','Win32'])test(`format shortcuts and hover hints match ${platform}`,async({page})=>{
 await page.addInitScript(platform=>Object.defineProperty(navigator,'platform',{get:()=>platform}),platform);
 await ready(page);const mod=platform==='MacIntel'?'Meta':'Control';
 const select=async()=>{const plain=page.locator('#message');if(await plain.isVisible())await plain.evaluate(el=>{el.focus();el.select();document.dispatchEvent(new Event('selectionchange'))});else await page.locator('#rich-editor').evaluate(el=>{el.focus();const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))})};
 await page.locator('#message').fill('shortcut sample');await select();await page.keyboard.press(mod+'+b');await expect(page.locator('#rich-editor b,#rich-editor strong')).toHaveText('shortcut sample');
 await select();await page.keyboard.press(mod+'+i');await expect(page.locator('#rich-editor i,#rich-editor em')).toHaveText('shortcut sample');
 await select();await page.keyboard.press(mod+'+u');await expect(page.locator('#rich-editor u')).toHaveText('shortcut sample');
 await select();await page.keyboard.press(mod+'+Shift+s');await expect(page.locator('#rich-editor strike,#rich-editor s')).toHaveText('shortcut sample');
 await select();await page.keyboard.press(mod+'+Backslash');await expect(page.locator('#rich-editor b,#rich-editor i,#rich-editor u,#rich-editor strike')).toHaveCount(0);
 await select();await page.keyboard.press(mod+'+e');await expect(page.locator('#rich-editor code')).toHaveText('shortcut sample');
 await select();await page.keyboard.press(mod+'+Shift+p');await expect(page.locator('#rich-editor [data-spoiler]')).toHaveText('shortcut sample');
 const bold=page.locator('#rich-toolbar [data-command=bold]');await expect(bold).toHaveAttribute('title',platform==='MacIntel'?/⌘B/:/Ctrl\+B/);await expect(bold).toHaveAttribute('aria-keyshortcuts',mod+'+B');
 await page.locator('#rich-editor').focus();await page.keyboard.press('Escape');await page.keyboard.insertText(' next');await expect(page.locator('#rich-editor [data-spoiler]')).toHaveText('shortcut sample');
 await select();await page.keyboard.press(mod+'+Alt+2');await expect(page.locator('#rich-editor h2')).toBeVisible();
 // Link shortcut opens the editor instead of browser navigation.
 await select();await page.keyboard.press(mod+'+k');await expect(page.locator('#editor-link')).toBeVisible();await page.keyboard.press('Escape');
});

for(const width of [390,1280])test(`paper dialogs keep the top layer through exit and can reopen at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await ready(page);await page.locator('#message').fill('Dialog motion');await page.locator('#create').click();
 const dialog=page.locator('#settings');await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('data-paper-state','open');
 await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).animationName)).toBe('paper-dialog-in');await page.waitForTimeout(600);
 await page.locator('#settings-close').click();await expect(dialog).toHaveAttribute('data-paper-state','closed');expect(await dialog.evaluate(el=>el.open)).toBe(true);
 expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
 await expect(dialog).not.toBeVisible();await expect(page.locator('#create')).toBeFocused();
 // Programmatic open while closing cancels the previous timer.
 await dialog.evaluate(el=>{el.showModal();el.close();el.showModal()});await page.waitForTimeout(750);await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('data-paper-state','open');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await page.locator('#create').click();await page.waitForTimeout(600);await page.mouse.click(2,2);await expect(dialog).not.toBeVisible();
});
test('reduced-motion dialogs close immediately and shadcn shares the paper exit',async({page})=>{
 await ready(page);await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#message').fill('Motion');await page.locator('#create').click();
 const native=page.locator('#settings');expect(await native.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.keyboard.press('Escape');expect(await native.evaluate(el=>el.open)).toBe(false);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('whisper:optical',{detail:{mode:'share',url:location.origin+'/s/'+'a'.repeat(16)+'#'+'A'.repeat(22)}})));
 const dialog=page.locator('[data-slot=dialog-content]');await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('data-paper-state','open');await page.waitForTimeout(600);
 await page.keyboard.press('Escape');await expect(dialog).toHaveAttribute('data-paper-state','closed');await expect(dialog).toBeVisible();await expect(dialog).toHaveCount(0);
});

test('chat notifications are opt-in, private, deduplicated and clear on focus',async({page,browser})=>{
 await page.addInitScript(()=>{
  window.testFocused=true;window.testNotices=[];window.testPermissionRequests=0;
  document.hasFocus=()=>window.testFocused;
  window.Notification=class {static permission='default';static async requestPermission(){window.testPermissionRequests++;this.permission='granted';return 'granted'}constructor(title,options){window.testNotices.push({title,...options})}close(){}};
 });
 await page.goto('/?mode=chat');await page.locator('#chat-name').fill('Host');await page.getByRole('button',{name:'Tạo phòng',exact:true}).click();await expect(page.locator('.chat-room')).toBeVisible();
 expect(await page.evaluate(()=>window.testPermissionRequests)).toBe(0);
 await page.getByRole('button',{name:'Bật thông báo',exact:true}).click();expect(await page.evaluate(()=>window.testPermissionRequests)).toBe(1);
 const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('whisper-chat-session'))),guest=await browser.newContext({locale:'vi-VN'}),p=await guest.newPage();
 try{
  await p.goto(`${new URL(page.url()).origin}/?mode=chat#r=${session.id}&a=${session.access}&k=${session.key}`);await p.locator('#chat-name').fill('Guest');await p.getByRole('button',{name:'Vào phòng',exact:true}).click();await expect(p.locator('.chat-room')).toBeVisible();
  await page.evaluate(()=>{window.testFocused=false;window.dispatchEvent(new Event('blur'))});
  await p.locator('.chat-emoji-composer').fill('super-private-message');await p.getByRole('button',{name:'Gửi',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.testNotices.length),{timeout:12000}).toBe(1);
  const notices=await page.evaluate(()=>window.testNotices);expect(JSON.stringify(notices)).not.toContain('super-private');expect(notices[0].body).toBe('Tin nhắn mới');expect(notices[0].tag).toBe('whisper-chat');await expect(page).toHaveTitle('(1) Whisper.');
  await page.waitForTimeout(3500);expect(await page.evaluate(()=>window.testNotices.length)).toBe(1);
  await page.evaluate(()=>{window.testFocused=true;window.dispatchEvent(new Event('focus'))});await expect(page).toHaveTitle(/^Whisper\./);
  await page.getByRole('button',{name:'Tắt thông báo',exact:true}).click();await page.evaluate(()=>{window.testFocused=false});await p.locator('.chat-emoji-composer').fill('muted message');await p.getByRole('button',{name:'Gửi',exact:true}).click();await expect(page).toHaveTitle('(1) Whisper.',{timeout:12000});expect(await page.evaluate(()=>window.testNotices.length)).toBe(1);
 }finally{await guest.close()}
});
