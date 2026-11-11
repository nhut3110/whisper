import {test as base,expect} from '@playwright/test';
import fs from 'node:fs/promises';
// V8 coverage from actual browser execution, merged separately from crypto unit coverage.
const test=base.extend({page:async({page},use,testInfo)=>{await page.coverage.startJSCoverage({resetOnNavigation:false});await use(page);const coverage=await page.coverage.stopJSCoverage();await fs.mkdir('coverage/browser-raw',{recursive:true});await fs.writeFile(`coverage/browser-raw/${testInfo.testId.replace(/[^a-z0-9]/gi,'_')}.json`,JSON.stringify(coverage));}});
async function share(page){
 await page.locator('#create').click();await solve(page);
}
async function solve(page){
 await expect(page.locator('#verification')).toBeVisible();
 await expect(page.locator('#challenge-label')).not.toHaveText('Đang chuẩn bị…');
 // Real input gestures; no challenge bypass in app or API.
 await page.waitForTimeout(550);
 if(await page.locator('#desktop-challenge').isVisible()){
  const target=Number((await page.locator('#challenge-label').textContent()).match(/\d+/)[0]);
  await page.locator('#wake-track').scrollIntoViewIfNeeded();const r=await page.locator('#wake-track').boundingBox();
  await page.mouse.move(r.x,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*target/100,r.y+r.height/2,{steps:8});await page.mouse.up();
  await page.locator('#settings-done').click();
 }else{
  const r=await page.locator('#slide-track').boundingBox();const handle=await page.locator('.sld-grip').boundingBox();expect(handle.x).toBeCloseTo(r.x+4,0);expect(handle.x+handle.width).toBeLessThan(r.x+r.width);await expect(page.locator('.sld-say')).toBeVisible();await expect(page.locator('.sld-say')).toHaveCSS('opacity','1');await page.mouse.move(r.x+24,r.y+28);await page.mouse.down();await page.mouse.move(r.x+25,r.y+28);await page.mouse.move(r.x+r.width,r.y+28,{steps:12});await page.mouse.up();
 }
}
async function create(page,{text='Chỉ giữa chúng ta 🐚\n秘密',pin=false,burn=true}={}){
  await page.goto('/');await page.locator('#message').fill(text);
  await page.locator('#create').click();if(pin)await page.getByLabel('Thêm mã 6 số').check();if(!burn)await page.getByLabel('Chỉ mở một lần',{exact:true}).uncheck();await solve(page);await expect(page.locator('#created')).toBeVisible();
  return {link:await page.locator('#share-link').inputValue(),revoke:await page.locator('#revoke-link').inputValue(),pin:await page.locator('#generated-pin').textContent()};
}
async function open(page,link,pin){await page.goto(link);await expect.poll(async()=>await page.locator('#ended').isVisible()||await page.locator('#open').isEnabled()).toBe(true);if(await page.locator('#ended').isVisible())return;await expect(page.locator('#receive')).toBeVisible();await page.locator('#create').click();if(pin)await page.locator('#pin').fill(pin);await page.locator('#open').click();}
async function closeReading(page){await page.locator('#create').click();await page.locator('#clear').click();}
test('create → explicit read → clear → second read denied; no plaintext in request',async({page})=>{
  const failures=[];page.on('pageerror',e=>failures.push(e.message));let sent;
  page.on('request',r=>{if(r.url().endsWith('/api/messages'))sent=r.postData();});
  const msg='Kiểm thử riêng tư 🐚\nDòng thứ hai';const {link}=await create(page,{text:msg});
  expect(sent).not.toContain('Kiểm thử');expect(JSON.parse(sent)).not.toHaveProperty('key');
  await page.goto(link);await expect(page.locator('#receive')).toBeVisible();expect(new URL(page.url()).hash).toBe('');await expect(page.locator('#plaintext')).toBeEmpty();
  await page.locator('#create').click();await page.locator('#open').click();await expect(page.locator('#plaintext')).toHaveText(msg);
  await closeReading(page);await expect(page.locator('#plaintext')).toBeEmpty();
  await open(page,link);await expect(page.locator('#ended')).toBeVisible();expect(failures).toEqual([]);
});
test('PIN prompt can retry and correct code opens',async({page})=>{const v=await create(page,{pin:true});await open(page,v.link);await expect(page.locator('#status')).toContainText('Cần mã');await page.locator('#pin').fill(v.pin==='000000'?'000001':'000000');await page.locator('#open').click();await expect(page.locator('#status')).toContainText('Cần mã');await page.locator('#pin').fill(v.pin);await page.locator('#open').click();await expect(page.locator('#reading')).toBeVisible();});
test('five wrong PINs burn the message',async({page})=>{const v=await create(page,{pin:true});await page.goto(v.link);await page.locator('#create').click();const wrong=v.pin==='000000'?'000001':'000000';await page.locator('#pin').fill(wrong);for(let i=0;i<5;i++){await page.locator('#open').click();if(i<4){await expect(page.locator('#status')).toContainText('Cần mã');await expect(page.locator('#open')).toBeEnabled();}}await expect(page.locator('#ended')).toBeVisible();await open(page,v.link,v.pin);await expect(page.locator('#ended')).toBeVisible();});
test('timed links reopen, sender can revoke',async({page})=>{const v=await create(page,{burn:false});for(let i=0;i<2;i++){await open(page,v.link);await expect(page.locator('#reading')).toBeVisible();}await page.goto(v.revoke);await expect(page.locator('#destroy')).toBeVisible();await page.locator('#revoke').click();await expect(page.locator('#ended')).toBeVisible();await open(page,v.link);await expect(page.locator('#ended')).toBeVisible();});
test('preview navigation alone does not consume',async({page})=>{const v=await create(page);await page.goto(v.link);await expect(page.locator('#receive')).toBeVisible();await page.goto('/');await open(page,v.link);await expect(page.locator('#reading')).toBeVisible();});
test('two recipient tabs race; exactly one reads',async({page,context})=>{const v=await create(page);const other=await context.newPage();await page.goto(v.link);await other.goto(v.link);await page.locator('#create').click();await other.locator('#create').click();await Promise.all([page.locator('#open').click(),other.locator('#open').click()]);await expect.poll(async()=>Number(await page.locator('#reading').isVisible())+Number(await other.locator('#reading').isVisible())).toBe(1);await expect.poll(async()=>Number(await page.locator('#ended').isVisible())+Number(await other.locator('#ended').isVisible())).toBe(1);await other.close();});
test('script-looking text remains literal text',async({page})=>{const text='<img src=x onerror="window.pwned=true">\n<script>window.pwned=true</script>';const v=await create(page,{text});await open(page,v.link);await expect(page.locator('#plaintext')).toHaveText(text);expect(await page.evaluate(()=>window.pwned)).toBeUndefined();expect(await page.locator('#plaintext img').count()).toBe(0);});
test('wrong encryption key in a legacy link fails closed after consumption',async({page})=>{const v=await create(page);const old=await page.evaluate(async link=>{const {deriveShortLink}=await import('/crypto.js');const d=await deriveShortLink(new URL(link).hash.slice(1));return `${location.origin}/m/${d.id}#k=${'A'.repeat(43)}&a=${d.access}`;},v.link);await open(page,old);await expect(page.locator('#ended-note')).toContainText('Không thể giải mã');await open(page,v.link);await expect(page.locator('#ended')).toBeVisible();});
test('malformed link and missing fragment fail without request',async({page})=>{let opens=0;page.on('request',r=>{if(r.url().endsWith('/open'))opens++;});for(const path of ['/m/'+ 'A'.repeat(43),'/m/'+ 'A'.repeat(43)+'#k=bad&a=bad','/revoke/'+'A'.repeat(43)+'#r=bad','/m/bad']){await page.goto(path);await expect(page.locator('#ended')).toBeVisible();}expect(opens).toBe(0);});
test('reload cannot resurrect memory-only key',async({page})=>{const v=await create(page,{burn:false});await open(page,v.link);await expect(page.locator('#reading')).toBeVisible();await page.reload();await expect(page.locator('#compose')).toBeVisible();await expect(page.locator('#reading')).toBeHidden();await expect(page.locator('#plaintext')).toBeEmpty();});
test('network failure during open is explained',async({page})=>{const v=await create(page);await page.route('**/open',r=>r.abort());await open(page,v.link);await expect(page.locator('#status')).toContainText('có thể đã bị tiêu thụ');await expect(page.locator('#open')).toBeEnabled();});
test('offline create retains draft and re-enables button',async({page})=>{await page.goto('/');await page.locator('#message').fill('Bản nháp còn đây');await page.route('**/api/messages',r=>r.abort());await share(page);await expect(page.locator('#status')).not.toBeEmpty();await expect(page.locator('#message')).toHaveValue('Bản nháp còn đây');await expect(page.locator('#create')).toBeEnabled();});
test('invalid content errors clear automatically and typing clears them',async({page})=>{
 await page.goto('/');await share(page);await expect(page.locator('#status')).toContainText('256 KiB');await page.locator('#settings-close').click();await page.waitForTimeout(4600);await expect(page.locator('#status')).toBeEmpty();
 await page.locator('#message').evaluate(el=>{el.value='🐚'.repeat(66000);});await share(page);await expect(page.locator('#status')).toContainText('256 KiB');await page.locator('#settings-close').click();await page.locator('#message').fill('Hợp lệ');await expect(page.locator('#status')).toBeEmpty();
});
test('clipboard buttons and fallback',async({page,context})=>{await context.grantPermissions(['clipboard-read','clipboard-write']);const v=await create(page,{pin:true});for(const [id,want] of [['copy-link',v.link],['copy-pin',v.pin],['copy-revoke',v.revoke]]){if(id==='copy-revoke')await page.locator('.revoke-block summary').click();await page.locator('#'+id).click();await expect(page.locator('#status')).toHaveText('Đã sao chép.');await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(want);}await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('blocked');};});await page.locator('#copy-link').click();await expect(page.locator('#status')).toContainText('Hãy chọn');});
test('expired message is unreadable after real wall-clock TTL',async({page})=>{test.setTimeout(90000);await page.goto('/');const v=await page.evaluate(async()=>{const {seal,randomToken}=await import('/crypto.js');const {key,...box}=await seal('Expiry test');const access=randomToken(),revoke=randomToken();const c=await (await fetch('/api/challenges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:false})})).json();await new Promise(r=>setTimeout(r,550));const res=await fetch('/api/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...box,access,revoke,ttl:60,burn:false,pin:null,verification:{id:c.id,answer:c.target}})});if(!res.ok)throw Error('create failed');const data=await res.json();return {link:`${location.origin}/m/${data.id}#k=${key}&a=${access}`,expires:data.expires_at};});await open(page,v.link);await expect(page.locator('#reading')).toBeVisible();await page.waitForTimeout(Math.max(0,v.expires*1000-Date.now()+1100));await open(page,v.link);await expect(page.locator('#ended')).toBeVisible();});
test('mobile compose and receive stay within viewport',async({page})=>{await page.setViewportSize({width:390,height:844});const v=await create(page,{pin:true});await page.screenshot({path:'test-results/mobile-created.png',fullPage:true});await open(page,v.link,v.pin);await expect(page.locator('#reading')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile-read.png',fullPage:true});});

test('custom expiry controls and no browser persistence',async({page})=>{await page.goto('/');await page.locator('#create').click();await page.locator('#ttl').selectOption('custom');await expect(page.locator('#custom-expiry')).toBeVisible();await page.locator('#ttl-minutes').fill('15');await page.locator('#settings-close').click();await page.locator('#message').fill('Custom TTL');const response=page.waitForResponse(r=>r.url().endsWith('/api/messages')&&r.request().method()==='POST');await share(page);const data=await (await response).json();expect(data.expires_at-Math.floor(Date.now()/1000)).toBeGreaterThanOrEqual(898);await expect(page.locator('#created')).toBeVisible();expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length,document.cookie])).toEqual([0,0,'']);});

test('plain reader copies all, individual paragraphs and selected substring',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const text='Phần thứ nhất\n\nPhần thứ hai';const v=await create(page,{text});await open(page,v.link);
 await page.locator('#copy-all').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(text);
 await page.getByRole('button',{name:'Sao chép đoạn này'}).nth(1).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Phần thứ hai');
 await page.evaluate(()=>{const node=document.querySelector('#plaintext .message-block').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,4);getSelection().removeAllRanges();getSelection().addRange(range);});
 await expect(page.locator('#copy-selection')).toBeVisible();await page.locator('#copy-selection').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Phần');
 await closeReading(page);await expect(page.locator('#plaintext')).toBeEmpty();await expect(page.locator('#copy-selection')).toBeHidden();
});
test('plain flow never downloads rich editor assets',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));const v=await create(page);await open(page,v.link);await expect(page.locator('#reading')).toBeVisible();expect(requests).not.toContain('/rich.js');expect(requests).not.toContain('/purify.js');
});
test('optional rich text formatting, sanitization, roundtrip and formatted clipboard',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.locator('#create').click();await page.locator('#rich-mode').check();await page.locator('#settings-close').click();await expect(page.locator('#rich-editor')).toBeVisible();
 await page.locator('#rich-editor').fill('Xin chào bạn');await page.evaluate(()=>{const el=document.querySelector('#rich-editor');el.focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});
 await page.getByRole('button',{name:'In đậm',exact:true}).click();await expect(page.locator('#rich-editor b, #rich-editor strong')).toHaveText('Xin chào bạn');
 await page.locator('#copy-draft').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Xin chào bạn');
 // Simulate malicious HTML supplied by a clipboard or a custom sender; it must be sanitized before encryption and again on read.
 await page.locator('#rich-editor').evaluate(el=>{el.innerHTML='<p><strong>Đậm</strong> và <em>nghiêng</em></p><p>Đoạn hai</p><img src="https://invalid.example/x" onerror="window.pwned=true"><script>window.pwned=true</script><a href="javascript:alert(1)">link</a>';});
 await share(page);await expect(page.locator('#created')).toBeVisible();const link=await page.locator('#share-link').inputValue();await open(page,link);await expect(page.locator('#plaintext strong')).toHaveText('Đậm');await expect(page.locator('#plaintext em')).toHaveText('nghiêng');expect(await page.locator('#plaintext img, #plaintext script, #plaintext a').count()).toBe(0);expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
 await page.locator('#copy-all').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Đậm và nghiêng');const html=await page.evaluate(async()=>{const items=await navigator.clipboard.read();const item=items.find(i=>i.types.includes('text/html'));return (await item.getType('text/html')).text();});expect(html).toContain('<strong>Đậm</strong>');expect(html).not.toContain('<img');
 await page.getByRole('button',{name:'Sao chép đoạn này'}).nth(1).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Đoạn hai');
});
test('turning formatting on/off preserves text and pastes only allowed markup',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Dòng một\nDòng hai');await page.locator('#create').click();await page.locator('#rich-mode').check();await page.locator('#settings-close').click();await expect(page.locator('#rich-editor')).toHaveText('Dòng mộtDòng hai');
 await page.locator('#rich-editor').evaluate(el=>{el.focus();const data=new DataTransfer();data.setData('text/html','<p><b>Paste an toàn</b><img src=x onerror="window.pwned=true"></p>');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(page.locator('#rich-editor img')).toHaveCount(0);await expect(page.locator('#rich-editor b')).toHaveText('Paste an toàn');await page.locator('#create').click();await page.locator('#rich-mode').uncheck();await page.locator('#settings-close').click();await expect(page.locator('#message')).toBeVisible();await expect(page.locator('#message')).toContainText('');expect(await page.locator('#message').inputValue()).toContain('Paste an toàn');
});
test('rich mode load failure falls back without losing plain draft',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Giữ bản nháp');await page.route('**/rich.js',r=>r.abort());await page.locator('#create').click();await page.locator('#rich-mode').check();await page.locator('#settings-close').click();await expect(page.locator('#status')).toContainText('văn bản thường');await expect(page.locator('#message')).toHaveValue('Giữ bản nháp');await expect(page.locator('#rich-mode')).not.toBeChecked();
});

test('writing surface keeps options hidden; settings support Escape and restore focus',async({page})=>{await page.goto('/');await expect(page.locator('#settings')).not.toBeVisible();await expect(page.locator('#ttl')).not.toBeVisible();await expect(page.locator('#burn')).not.toBeVisible();await page.locator('#create').click();await expect(page.getByRole('dialog',{name:'Cài đặt cho link này',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#settings')).not.toBeVisible();await expect(page.locator('#create')).toBeFocused();await page.locator('#create').click();await page.locator('#settings-close').click();await expect(page.locator('#settings')).not.toBeVisible();});

test('rich text without paragraph tags still has a copy-part action',async({page,context})=>{await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.locator('#create').click();await page.locator('#rich-mode').check();await page.locator('#settings-close').click();await page.locator('#rich-editor').fill('Rich text không có thẻ đoạn');await share(page);await expect(page.locator('#created')).toBeVisible();const link=await page.locator('#share-link').inputValue();await open(page,link);await expect(page.getByRole('button',{name:'Sao chép đoạn này'})).toHaveCount(1);await page.getByRole('button',{name:'Sao chép đoạn này'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Rich text không có thẻ đoạn');});

test('compact links use only a 22-character fragment; seed and key never reach API',async({page})=>{let body;page.on('request',r=>{if(r.url().endsWith('/api/messages'))body=JSON.parse(r.postData());});const v=await create(page,{pin:true});const u=new URL(v.link);expect(u.pathname).toBe('/');expect(u.hash).toMatch(/^#[A-Za-z0-9_-]{22}$/);expect(v.link.length).toBe(u.origin.length+24);expect(body).not.toHaveProperty('seed');expect(body).not.toHaveProperty('key');expect(JSON.stringify(body)).not.toContain(u.hash.slice(1));await open(page,v.link,v.pin);await expect(page.locator('#reading')).toBeVisible();});
test('new messages also open via the compatible legacy format',async({page})=>{const v=await create(page);const old=await page.evaluate(async link=>{const {deriveShortLink}=await import('/crypto.js');const d=await deriveShortLink(new URL(link).hash.slice(1));return `${location.origin}/m/${d.id}#k=${d.key}&a=${d.access}`;},v.link);await open(page,old);await expect(page.locator('#reading')).toBeVisible();});
test('malformed compact links do not make open requests',async({page})=>{let count=0;page.on('request',r=>{if(r.url().endsWith('/open'))count++;});for(const fragment of ['#bad','#'+ 'A'.repeat(21)+'B']){await page.goto('/'+fragment);await expect(page.locator('#ended')).toBeVisible();}expect(count).toBe(0);});

test('soft W. only and one settings screen without a chevron',async({page})=>{
 await page.goto('/');await expect(page).toHaveTitle('Whisper. — Lời nhắn');await expect(page.getByRole('link',{name:'Whisper.'})).toBeVisible();await expect(page.locator('.brand')).toHaveText('');await expect(page.locator('.brand-mark path')).toHaveAttribute('d',/c/);await expect(page.locator('#settings-open')).toHaveCount(0);
 await page.locator('#create').click();await expect(page.locator('#settings #verification')).toBeVisible();await page.locator('#settings-close').click();await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('theme follows system until explicitly selected, persists only appearance, and leaves draft intact',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('#message').fill('Bản nháp không lưu');
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-pressed','true');
 await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('#message')).toHaveValue('Bản nháp không lưu');
 expect(await page.evaluate(()=>Object.entries(localStorage))).toEqual([['whisper-theme','light']]);await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('#message')).toHaveValue('');await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
test('theme still works when storage is unavailable',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked');}}));await page.emulateMedia({colorScheme:'light'});await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
test('dark theme covers create, settings, receiving, reading and close states',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});const v=await create(page,{pin:true});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('#created')).toBeVisible();await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('#theme-toggle').click();
 await open(page,v.link,v.pin);await expect(page.locator('#reading')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await closeReading(page);await expect(page.locator('#ended')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('eyes follow the cursor; header contains only the W. logo',async({page})=>{
 await page.goto('/');await expect(page.locator('.brand')).toHaveText('');await expect(page.locator('.brand-mark circle')).toHaveCount(1);
 const eye=page.locator('#create .face-rig'),before=await eye.getAttribute('transform');await page.mouse.move(20,20);
 await expect.poll(()=>eye.getAttribute('transform')).not.toBe(before);
 await page.locator('#message').fill('Theo dõi rồi gửi');await share(page);await expect(page.locator('#create')).toHaveClass(/anonymous/);await expect(page.locator('#create')).toBeDisabled();
});
test('keyboard verification, cancel, failed challenge and retry retain the draft',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Không mất bản nháp');await page.locator('#create').click();await expect(page.locator('#verification')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#message')).toHaveValue('Không mất bản nháp');
 await page.route('**/api/challenges',r=>r.abort());await page.locator('#create').click();await expect(page.locator('#verification-note')).not.toBeEmpty();await page.locator('#settings-close').click();await page.unroute('**/api/challenges');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/challenges'));await page.locator('#create').click();const c=await(await response).json();await page.waitForTimeout(550);
 const slider=page.locator('#wake-track');await slider.focus();await page.keyboard.press('Home');for(let i=0;i<c.target;i++)await page.keyboard.press('ArrowRight');await page.locator('#settings-done').click();await expect(page.locator('#created')).toBeVisible();
});
test('mobile partial slide returns home; keyboard alternative confirms and timed metadata is accurate',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#message').fill('Mobile thử nghiệm');await page.locator('#create').click();await page.locator('#burn').uncheck();await expect(page.locator('#mobile-challenge')).toBeVisible();
 const r=await page.locator('#slide-track').boundingBox();const handle=await page.locator('.sld-grip').boundingBox();expect(handle.x).toBeCloseTo(r.x+4,0);expect(handle.x+handle.width).toBeLessThan(r.x+r.width);await expect(page.locator('.sld-say')).toBeVisible();await expect(page.locator('.sld-say')).toHaveCSS('opacity','1');await page.mouse.move(r.x+24,r.y+28);await page.mouse.down();await page.mouse.move(r.x+25,r.y+28);await page.mouse.move(r.x+100,r.y+28,{steps:6});await page.mouse.up();
 await expect.poll(()=>page.locator('.sld-grip').evaluate(e=>e.style.transform)).toBe('translateX(0px)');await expect(page.locator('#created')).toBeHidden();await page.waitForTimeout(550);await page.locator('.sld-grip').focus();for(let i=0;i<11;i++)await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect(page.locator('#created')).toBeVisible();
 const link=await page.locator('#share-link').inputValue();await page.goto(link);await expect(page.locator('#receive-note')).toContainText('Bạn có thể mở lại');await expect(page.locator('#pin')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('long text beyond the old 32 KiB limit roundtrips',async({page})=>{
 const text='A private long message 🐚\n'.repeat(4000);const v=await create(page,{text,burn:false});await open(page,v.link);await expect(page.locator('#reading')).toBeVisible();await expect(page.locator('#plaintext')).toHaveText(text);
});
test('thought bubbles appear, pause and rotate without blocking the editor',async({page})=>{
 await page.goto('/');await expect(page.locator('#watcher-line')).toHaveAttribute('data-on','');const line=await page.locator('#watcher-line').textContent();await page.waitForTimeout(5400);await expect(page.locator('#watcher-line')).not.toHaveAttribute('data-on','');await expect.poll(()=>page.locator('#watcher-line').textContent(),{timeout:6500}).not.toBe(line);await expect(page.locator('#watcher-line')).toHaveAttribute('data-on','');
});
test('locale selection uses browser locale and falls back to English; all 16 languages work',async({page,context})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'languages',{get:()=>['xx-ZZ']});});await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('#message')).toHaveAttribute('placeholder','Write or paste something…');
 const languages=await page.locator('#language option').evaluateAll(options=>options.map(o=>o.value).filter(v=>v!=='auto'));expect(languages).toHaveLength(16);
 for(const lang of languages){await page.locator('#language').selectOption(lang);await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page.locator('#settings-title')).not.toBeEmpty();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.locator('#language').selectOption('ar');await expect(page.locator('html')).toHaveAttribute('dir','rtl');await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','ar');
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual(['whisper-language']);
});
async function recordVoice(page){
 await page.locator('#audio-mode').click();await expect(page.locator('#create')).toHaveAttribute('aria-label','Nhấn giữ để ghi âm');await page.waitForTimeout(600);
 await page.locator('#create').focus();await page.keyboard.down('Space');await expect(page.locator('#recording-wave')).toBeVisible();await expect(page.locator('#create')).toHaveAttribute('data-gear','recording');await page.waitForTimeout(800);await page.screenshot({path:'test-results/audio-recording.png'});await page.waitForTimeout(500);await page.keyboard.up('Space');await expect(page.locator('#voice-preview')).toBeVisible();await expect(page.locator('#share-recording')).toBeVisible();
}
test('real MediaRecorder audio → preview/play/seek → encrypted share → single read and clear',async({page})=>{
 let sent;const failures=[];page.on('pageerror',e=>failures.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/messages'))sent=JSON.parse(r.postData());});await page.goto('/');
 // Observe browser MediaStreamTrack lifecycle without substituting MediaRecorder or the analyser.
 await page.evaluate(()=>{window.micTracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const stream=await original(c);window.micTracks.push(...stream.getTracks());return stream;};});
 await recordVoice(page);expect(await page.evaluate(()=>micTracks.every(t=>t.readyState==='ended'))).toBe(true);
 await expect(page.locator('#voice-preview .voice-bar')).toHaveCount(40);expect(await page.locator('#voice-preview .voice-bar').evaluateAll(b=>b.some(e=>parseFloat(e.style.height)>8))).toBe(true);
 await page.locator('#voice-preview .voice-play').click();await expect(page.locator('#create')).toHaveAttribute('data-expression','playing');await page.locator('#voice-preview .voice-seek').fill('500');await page.locator('#voice-preview .voice-play').click();await page.screenshot({path:'test-results/audio-preview.png'});
 await page.locator('#share-recording').click();await solve(page);await expect(page.locator('#created')).toBeVisible();const link=await page.locator('#share-link').inputValue();
 expect(sent).not.toHaveProperty('audio');expect(sent).not.toHaveProperty('mime');expect(sent).not.toHaveProperty('key');
 const envelope=await page.evaluate(async({link,sent})=>{const c=await import('/crypto.js'),a=await import('/audio.js'),d=await c.deriveShortLink(new URL(link).hash.slice(1)),bytes=await c.unsealBytes(sent.ciphertext,sent.iv,d.key),clip=a.unpackClip(bytes);return {size:clip.blob.size,type:clip.blob.type,seconds:clip.seconds};},{link,sent});expect(envelope.size).toBeGreaterThan(1000);expect(envelope.type).toMatch(/^audio\//);expect(envelope.seconds).toBeGreaterThan(.5);
 await open(page,link);await expect(page.locator('#received-audio')).toBeVisible();await expect(page.locator('#share-dock')).toHaveClass(/mascot-center/);await expect(page.locator('#create')).toHaveAttribute('data-gear','performing');await page.waitForTimeout(1100);await page.screenshot({path:'test-results/mascot-audio-reader.png'});await expect(page.locator('#copy-all')).toBeHidden();await page.locator('#received-audio .voice-play').click();await expect.poll(()=>page.locator('#received-audio audio').evaluate(el=>!el.paused)).toBe(true);await closeReading(page);await expect(page.locator('#received-audio audio')).toHaveCount(0);await open(page,link);await expect(page.locator('#ended')).toBeVisible();expect(failures).toEqual([]);
});
test('microphone denial and delayed permission release do not leak a stream',async({page})=>{
 await page.goto('/');await page.evaluate(()=>navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');});await page.locator('#audio-mode').click();await page.waitForTimeout(600);await page.locator('#create').focus();await page.keyboard.down('Space');await page.keyboard.up('Space');await expect(page.locator('#status')).toContainText('microphone');await expect(page.locator('#voice-preview')).toBeHidden();
 await page.reload();await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.micTracks=[];navigator.mediaDevices.getUserMedia=async c=>{const stream=await original(c);window.micTracks.push(...stream.getTracks());await new Promise(r=>setTimeout(r,450));return stream;};});await page.locator('#audio-mode').click();await page.waitForTimeout(600);await page.locator('#create').focus();await page.keyboard.down('Space');await page.keyboard.up('Space');await expect.poll(()=>page.evaluate(()=>micTracks.length>0&&micTracks.every(t=>t.readyState==='ended'))).toBe(true);await expect(page.locator('#voice-preview')).toBeHidden();
});
test('switching to text while holding stops microphone; re-record and delete work on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.evaluate(()=>{window.micTracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const stream=await original(c);window.micTracks.push(...stream.getTracks());return stream;};});await page.locator('#audio-mode').click();await page.waitForTimeout(600);await page.locator('#create').focus();await page.keyboard.down('Space');await expect(page.locator('#recording-wave')).toBeVisible();await page.locator('#text-mode').click();await page.keyboard.up('Space');expect(await page.evaluate(()=>micTracks.every(t=>t.readyState==='ended'))).toBe(true);await expect(page.locator('#message')).toBeVisible();
 await recordVoice(page);await page.screenshot({path:'test-results/audio-mobile.png'});await page.locator('#delete-recording').click();await expect(page.locator('#voice-preview')).toBeHidden();await expect(page.locator('#share-recording')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('audio envelopes reject unsafe types, malformed metadata and empty recordings',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{const {unpackClip,packClip}=await import('/audio.js');const encoder=new TextEncoder(),good={mime:'audio/webm;codecs=opus',seconds:1,peaks:[0,255]};const envelope=h=>encoder.encode('whisper:audio:v1\n'+JSON.stringify(h)+'\nX');let rejected=0;for(const h of [{...good,mime:'text/html'},{...good,seconds:121},{...good,seconds:-1},{...good,peaks:[256]},{...good,peaks:Array(65).fill(0)}])try{unpackClip(envelope(h));}catch{rejected++;}try{unpackClip(encoder.encode('whisper:audio:v1\n{}\n'));}catch{rejected++;}try{await packClip({blob:new Blob([new Uint8Array(2097152)],{type:'audio/webm'}),seconds:1,peaks:[]});}catch{rejected++;}return {rejected,text:unpackClip(encoder.encode('ordinary message'))};});expect(result).toEqual({rejected:7,text:null});
});
test('rapid consecutive holds do not mix recordings and leaving the page stops the mic',async({page})=>{
 await page.goto('/');await page.locator('#audio-mode').click();await page.waitForTimeout(600);await page.evaluate(()=>{window.micTracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const stream=await original(c);window.micTracks.push(...stream.getTracks());return stream;};});await page.locator('#create').focus();
 for(let i=0;i<2;i++){await page.keyboard.down('Space');await expect(page.locator('#recording-wave')).toBeVisible();await page.waitForTimeout(650);await page.keyboard.up('Space');}
 await expect(page.locator('#voice-preview')).toBeVisible();expect(await page.evaluate(()=>micTracks.every(t=>t.readyState==='ended'))).toBe(true);
 await page.keyboard.down('Space');await expect(page.locator('#recording-wave')).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.keyboard.up('Space');expect(await page.evaluate(()=>micTracks.every(t=>t.readyState==='ended'))).toBe(true);await expect(page.locator('#voice-preview audio')).toHaveCount(0);
});


test('whole face stays inside the body at extreme cursor positions and takes a blink break',async({page})=>{
 await page.goto('/');await page.locator('#audio-mode').click();
 const bot=page.locator('#create');
 await bot.evaluate(el=>{window.frontBlinked=false;new MutationObserver(()=>{if(el.dataset.attention==='front'&&Number(el.querySelector('.eyt-eye').getAttribute('height'))<3.9)window.frontBlinked=true;}).observe(el.querySelector('.eyt-eye'),{attributes:true,attributeFilter:['height']});});
 for(const [x,y] of [[0,0],[1279,0],[1279,719],[0,719]]){
  await page.mouse.move(x,y);await page.waitForTimeout(450);
  const clearance=await bot.evaluate(el=>{const body=el.querySelector('.eyt-body').getBoundingClientRect();return [...el.querySelectorAll('.eye,.bot-mouth')].map(n=>{const r=n.getBoundingClientRect();return Math.min(r.left-body.left,body.right-r.right,r.top-body.top,body.bottom-r.bottom);});});
  expect(Math.min(...clearance)).toBeGreaterThan(12);
 }
 await expect(bot).toHaveAttribute('data-attention','front',{timeout:5500});
 await expect.poll(()=>bot.locator('.face-rig').getAttribute('transform')).toMatch(/translate\(-?0\.00\d -?0\.00\d\)/);
 await expect.poll(()=>page.evaluate(()=>window.frontBlinked),{timeout:2500}).toBe(true);
 await expect(bot).toHaveAttribute('data-attention','follow',{timeout:3500});
});

test('voice text and recording bubbles stay centered on the bot at narrow sizes',async({page})=>{
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:width===1280?800:720});await page.goto('/');await page.locator('#audio-mode').click();
  await expect(page.locator('#watcher-line')).toHaveAttribute('data-on','');
  const aligned=async selector=>page.locator(selector).evaluate(el=>{const b=document.querySelector('#create').getBoundingClientRect(),r=el.getBoundingClientRect();return {offset:Math.abs(r.left+r.width/2-b.left-b.width/2),left:r.left,right:r.right,top:r.top,bottom:r.bottom,botTop:b.top,width:innerWidth};});
  await page.waitForTimeout(450);await page.screenshot({path:`test-results/face-intro-${width}.png`});const text=await aligned('#watcher-line');expect(text.offset).toBeLessThan(1);expect(text.left).toBeGreaterThanOrEqual(12);expect(text.right).toBeLessThanOrEqual(text.width-12);expect(text.top).toBeGreaterThan(60);expect(text.bottom).toBeLessThan(text.botTop);
  await page.locator('#create').focus();await page.keyboard.down('Space');await expect(page.locator('#recording-wave')).toBeVisible();
  const wave=await aligned('#recording-wave');expect(wave.offset).toBeLessThan(1);expect(wave.bottom).toBeLessThan(wave.botTop);expect(wave.top).toBeGreaterThan(60);
  await page.waitForTimeout(800);await page.screenshot({path:`test-results/face-recording-${width}.png`});await page.keyboard.up('Space');await expect(page.locator('#voice-preview')).toBeVisible();await page.screenshot({path:`test-results/face-${width}.png`});
 }
});

test('header keeps theme copy language modes in order, and touch slider uses the full sheet',async({page,browser})=>{
 for(const width of [320,390,820]){
  await page.setViewportSize({width,height:850});await page.goto('/');
  const positions=await page.locator('#theme-toggle,#copy-draft,.language-control,#compose-actions').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().left));
  expect(positions).toEqual([...positions].sort((a,b)=>a-b));
  await page.locator('#language').selectOption('en');await expect(page.locator('html')).toHaveAttribute('lang','en');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const context=await browser.newContext({viewport:{width:820,height:1000},hasTouch:true,locale:'en-US'}),touchPage=await context.newPage();
 await touchPage.goto(process.env.EDGE_TEST_BASE||'http://localhost:8787/');await touchPage.locator('#message').fill('Touch tablet');await touchPage.locator('#create').click();
 await expect(touchPage.locator('#mobile-challenge')).toBeVisible();
 const widths=await touchPage.locator('#slide-track').evaluate(el=>({track:el.getBoundingClientRect().width,available:document.querySelector('#verification').getBoundingClientRect().width}));
 expect(Math.abs(widths.track-widths.available)).toBeLessThan(1);
 await touchPage.screenshot({path:'test-results/full-width-touch-slider.png'});await context.close();
});

test('creation automatically copies only the share link and explains its single appearance',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);const v=await create(page,{pin:true});
 await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(v.link);
 await expect(page.locator('#link-reminder')).toContainText('sao chép');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).not.toContain(v.pin);
});

test('automatic clipboard refusal retains selectable link and manual copy fallback',async({page})=>{
 await page.addInitScript(()=>{navigator.clipboard.writeText=async()=>{throw new Error('blocked');};});
 const v=await create(page);await expect(page.locator('#status')).toContainText('thủ công');
 await expect(page.locator('#share-link')).toHaveValue(v.link);await expect(page.locator('#copy-link')).toBeEnabled();await expect(page.locator('#link-reminder')).toBeVisible();
});

test('Markdown is automatically rendered, sanitized and copied as readable formatted content',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const v=await create(page,{text:'# Ocean\n\n**Bold** and *gentle*\n\n- Fish\n- Coral\n\n```js\nconst sea = "quiet";\n```\n\n| Item | Count |\n| --- | --- |\n| Pearl | 2 |\n\n[Sea guide](https://example.com/sea)\n\n<img src="https://tracker.invalid/x" onerror="window.pwned=true">\n[unsafe](javascript:alert(1))'});
 await open(page,v.link);await expect(page.locator('#plaintext h1')).toHaveText('Ocean');await expect(page.locator('#plaintext strong')).toHaveText('Bold');await expect(page.locator('#plaintext li')).toHaveCount(2);await expect(page.locator('#plaintext pre code')).toContainText('const sea');await expect(page.locator('#plaintext table')).toHaveCount(1);
 await expect(page.locator('#plaintext img,#plaintext script,#plaintext a:not([href^="https://"])')).toHaveCount(0);await expect(page.locator('#plaintext a')).toHaveAttribute('rel','noopener noreferrer');expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
 await page.locator('#copy-all').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Bold and gentle');
 await page.screenshot({path:'test-results/automatic-markdown.png'});
});

test('pasting rich HTML automatically enables safe formatting and roundtrips without setup',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Before ');
 await page.locator('#message').evaluate(el=>{el.focus();el.setSelectionRange(el.value.length,el.value.length);const data=new DataTransfer();data.setData('text/plain','Hello coral');data.setData('text/html','<p><strong>Hello</strong> <em>coral</em><img src=x onerror="window.pwned=true"></p>');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await expect(page.locator('#rich-editor')).toBeVisible();await expect(page.locator('#rich-editor strong')).toHaveText('Hello');await expect(page.locator('#rich-editor img')).toHaveCount(0);
 await share(page);await expect(page.locator('#created')).toBeVisible();const link=await page.locator('#share-link').inputValue();await open(page,link);await expect(page.locator('#plaintext strong')).toHaveText('Hello');await expect(page.locator('#plaintext')).toContainText('Before');
});

test('mode animation stays continuous when reversed and retains text and accessibility state',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Keep my draft');await page.locator('#audio-mode').click();await expect(page.locator('#audio-mode')).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(150);
 const before=await page.locator('#create').boundingBox();await page.locator('#text-mode').click();await page.waitForTimeout(130);const after=await page.locator('#create').boundingBox();
 // Reversal starts at the currently displayed position, not the old destination.
 expect(Math.hypot(before.x-after.x,before.y-after.y)).toBeLessThan(150);
 await expect(page.locator('#message')).toBeVisible();await expect(page.locator('#message')).toHaveValue('Keep my draft');await expect(page.locator('#audio-mode')).toHaveAttribute('aria-pressed','false');
 await page.waitForTimeout(750);expect(await page.locator('#create').evaluate(el=>el.getAnimations().length)).toBe(0);
});

test('touch companion cycles distinct emotes with no fake cursor following and respects reduced motion',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,locale:'vi-VN'}),page=await context.newPage();
 await page.clock.install();await page.goto(process.env.EDGE_TEST_BASE||'http://localhost:8787/');
 await page.evaluate(()=>{window.emotes=[];new MutationObserver(()=>{const mood=document.querySelector('#create').dataset.emote;if(mood!=='neutral')window.emotes.push(mood);}).observe(document.querySelector('#create'),{attributes:true,attributeFilter:['data-emote']});});
 await page.touchscreen.tap(30,180);await page.clock.runFor(16000);
 const values=await page.evaluate(()=>[...new Set(window.emotes)]);expect(values.length).toBeGreaterThanOrEqual(2);
 expect(await page.locator('#create .face-rig').getAttribute('transform')).toMatch(/translate\(0\.000 0\.000\)/);
 await page.screenshot({path:'test-results/touch-emote.png'});await context.close();
 const quiet=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),q=await quiet.newPage();await q.clock.install();await q.goto(process.env.EDGE_TEST_BASE||'http://localhost:8787/');await q.clock.runFor(16000);await expect(q.locator('#create')).toHaveAttribute('data-emote','neutral');await quiet.close();
});

test('mascot recipient confirmation never consumes on cancel; navbar follows long reading',async({page})=>{
 const text=Array.from({length:100},(_,i)=>`Dòng ${i}: một lời thì thầm dài.`).join('\n\n');const v=await create(page,{text});let opens=0;
 page.on('request',r=>{if(r.url().endsWith('/open'))opens++;});await page.goto(v.link);
 await expect(page.locator('#share-dock')).toHaveClass(/mascot-center/);await expect(page.locator('#watcher-line')).toContainText('Có người gửi');await page.waitForTimeout(750);await page.screenshot({path:'test-results/mascot-intro.png'});
 await page.locator('#create').click();await expect(page.locator('#recipient-open')).toBeVisible();await page.keyboard.press('Escape');
 await expect(page.locator('#recipient-open')).toBeHidden();expect(opens).toBe(0);await expect(page.locator('#create')).toBeFocused();
 await page.locator('#create').press('Enter');await page.locator('#open').click();await expect(page.locator('#plaintext')).toContainText('Dòng 99');
 await expect(page.locator('#share-dock')).not.toHaveClass(/mascot-center/);await expect(page.locator('header #copy-all')).toBeVisible();await page.waitForTimeout(750);await page.screenshot({path:'test-results/mascot-text-reader.png'});
 await page.evaluate(()=>scrollTo(0,1600));expect(await page.locator('header').evaluate(e=>e.getBoundingClientRect().top)).toBe(0);
 await page.locator('#create').click();await expect(page.locator('#recipient-close')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#reading')).toBeVisible();
 await closeReading(page);await expect(page.locator('#share-dock')).toHaveClass(/mascot-center/);await expect(page.locator('#plaintext')).toBeEmpty();
 await open(page,v.link);await expect(page.locator('#ended')).toBeVisible();await expect(page.locator('#create')).toBeEnabled();await page.locator('#create').click();await expect(page.locator('#compose')).toBeVisible();
});

test('recipient bubbles and action dialogs fit narrow and short touch layouts',async({page})=>{
 for(const size of [{width:320,height:640},{width:667,height:375}]){
  await page.setViewportSize(size);const v=await create(page);await page.goto(v.link);
  await expect(page.locator('#watcher-line')).toHaveAttribute('data-on','');await page.waitForTimeout(500);
  const box=await page.locator('#watcher-line').boundingBox(),header=await page.locator('header').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y).toBeGreaterThanOrEqual(header.height);
  await page.screenshot({path:`test-results/mascot-recipient-${size.width}.png`});
  await page.locator('#create').click();await expect(page.locator('#recipient-open')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#open').click();await expect(page.locator('#reading')).toBeVisible();await closeReading(page);await expect(page.locator('#ended')).toBeVisible();
  await page.locator('#language').selectOption('en');await expect(page.locator('#watcher-line')).toContainText('Cleared from this screen');
 }
});
