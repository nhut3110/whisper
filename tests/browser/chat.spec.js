import {test,expect} from '@playwright/test';
import pg from 'pg';
const enabled=!!process.env.TEST_DATABASE_URL&&process.env.CHAT_TESTS==='1';
test.skip(!enabled,'Use CHAT_TESTS=1 TEST_DATABASE_URL=<disposable> playwright test -c playwright.chat.config.js');
let pool;
test.beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL})});
test.beforeEach(async({page})=>{await page.route('**/api/rooms/*/preview',route=>route.fulfill({json:{}}));await pool.query('TRUNCATE public.whisper_rooms,public.hush_abuse_budgets CASCADE')});
test.afterAll(()=>pool?.end());
async function create(page,{mode='total',limit=10,count=4}={}){
 await page.goto('/chat');await page.locator('#chat-name').fill('Host');await page.locator('#chat-count').click();await page.getByRole('option',{name:String(count),exact:true}).click();await page.locator('.chat-more-settings summary').click();await page.locator('#chat-mode').click();await page.getByRole('option',{name:mode==='total'?'Giới hạn tổng':'Giữ tin mới',exact:true}).click();await page.locator('#chat-limit').fill(String(limit));await page.getByRole('button',{name:'Tạo phòng',exact:true}).click();await expect(page.locator('.chat-room')).toBeVisible();await expect(page.locator('.chat-room-bar')).toContainText('Hết hạn');await expect(page.locator('.chat-room-bar')).not.toContainText('· 0 min');
 await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('whisper-chat-session')).joined)).toBe(true);
 const s=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('whisper-chat-session')));return {session:s,url:`http://localhost:8788/?mode=chat#r=${s.id}&a=${s.access}&k=${s.key}`};
}
async function guest(browser,url,name){const context=await browser.newContext({locale:'vi-VN'});const page=await context.newPage();await page.route('**/api/rooms/*/preview',route=>route.fulfill({json:{}}));await page.goto(url);await page.locator('#chat-name').fill(name);await page.getByRole('button',{name:'Vào phòng',exact:true}).click();return {context,page};}
async function send(page,text){await page.getByRole('textbox',{name:'Nói gì đó nhé…'}).fill(text);await page.getByRole('button',{name:'Gửi',exact:true}).click();await expect.poll(()=>page.getByRole('textbox',{name:'Nói gì đó nhé…'}).evaluateAll(nodes=>nodes.map(e=>e.textContent).join(''))).toBe('');await expect(page.locator('.chat-message-text').filter({hasText:text}).last()).toBeVisible();}
test('two real browser contexts exchange encrypted text, reply, react, edit, delete, show seen and confirm links',async({page,browser,context})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await context.grantPermissions(['clipboard-read','clipboard-write']);const {url,session}=await create(page);const second=await guest(browser,url,'Guest');
 try{
  await expect(second.page.locator('.chat-room')).toBeVisible();await expect(second.page).toHaveURL('/?mode=chat');await send(page,'Hello private room');await expect(second.page.getByText('Hello private room',{exact:true})).toBeVisible();
  await expect(page.locator('.chat-receipt').last()).toHaveText('Đã đọc',{timeout:12000});
  await second.page.locator('.chat-message').first().locator('[data-slot=bubble-content]').hover();await second.page.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await second.page.locator('.chat-quick-emojis').getByRole('button',{name:'👍',exact:true}).click();await expect(page.locator('.chat-reactions').getByRole('button',{name:'👍 1',exact:true})).toBeVisible();
  await second.page.locator('.chat-message').first().locator('[data-slot=bubble-content]').hover();await second.page.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).click();await second.page.getByRole('menuitem',{name:'Trả lời',exact:true}).click();await send(second.page,'A reply');await expect(page.locator('.chat-reply-quote')).toHaveText('Hello private room');
  await page.locator('.chat-message').first().locator('[data-slot=bubble-content]').hover();await page.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).first().click();await page.getByRole('menuitem',{name:'Sửa',exact:true}).click();await page.getByRole('textbox',{name:'Nói gì đó nhé…'}).fill('Edited private room');await page.getByRole('button',{name:'Lưu',exact:true}).click();await expect(second.page.locator('.chat-message-text').first()).toHaveText('Edited private room');
  await send(second.page,'https://example.com/safe');await expect(page.locator('.chat-link-card strong')).toHaveText('example.com');await page.locator('.chat-link-card').click();await expect(page.getByRole('dialog')).toContainText('Whisper không xác minh');await expect(page.getByRole('dialog').locator('code')).toHaveText('https://example.com/safe');await page.getByRole('button',{name:'Huỷ',exact:true}).click();
  await page.getByRole('button',{name:'Copy lời mời'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
  const rows=await pool.query('SELECT ciphertext FROM whisper_chat_messages WHERE room=$1',[session.id]);expect(JSON.stringify(rows.rows)).not.toContain('private room');
  await page.locator('.chat-message').first().locator('[data-slot=bubble-content]').hover();await page.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).first().click();await page.getByRole('menuitem',{name:'Xoá',exact:true}).click();await expect(second.page.locator('.chat-message-text').filter({hasText:'Edited private room'})).toHaveCount(0);expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/chat-desktop.png'});
 }finally{await second.context.close()}
});
test('rolling room keeps latest N messages, full room rejects an extra person and host destruction reaches everyone',async({page,browser})=>{
 const {url}=await create(page,{mode:'rolling',limit:2,count:2});const second=await guest(browser,url,'Guest');const third=await guest(browser,url,'Overflow');
 try{await expect(third.page.getByRole('alert')).toContainText('đủ người');await send(page,'First');await send(page,'Second');await send(page,'Third');await expect(page.locator('.chat-message-text')).toHaveText(['Second','Third']);await expect(second.page.locator('.chat-message-text')).toHaveText(['Second','Third']);
 await page.getByRole('button',{name:'Thành viên',exact:true}).click();await page.getByRole('button',{name:'Huỷ phòng',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Huỷ phòng',exact:true}).click();await expect(page.locator('.chat-ended')).toContainText('tan biến');await expect(second.page.locator('.chat-ended')).toContainText('tan biến',{timeout:12000});await expect(page.locator('.chat-log')).toHaveCount(0);
 }finally{await second.context.close();await third.context.close()}
});
test('small file travels encrypted and downloads intact; unsupported formats rejected; total cap locks composer',async({page,browser})=>{
 const {url}=await create(page);const second=await guest(browser,url,'Guest');try{
 await page.locator('input[type=file]').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.getByRole('alert')).toContainText('không được hỗ trợ');
 await page.locator('input[type=file]').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('Encrypted attachment demo')});await page.getByRole('button',{name:'Gửi',exact:true}).click();await expect(second.page.locator('.chat-attachment')).toContainText('note.txt');await second.page.getByRole('button',{name:'Tải file đính kèm: note.txt',exact:true}).click();const download=second.page.waitForEvent('download');await second.page.getByRole('dialog').getByRole('button',{name:'Tải file đính kèm'}).click();const file=await download;expect(file.suggestedFilename()).toBe('note.txt');const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);expect(Buffer.concat(chunks).toString()).toBe('Encrypted attachment demo');
 for(let n=2;n<=10;n++)await send(page,'Message '+n);await expect(page.locator('.chat-locked')).toBeVisible();await expect(second.page.locator('.chat-locked')).toBeVisible();await expect(page.locator('.chat-compose')).toHaveCount(0);
 }finally{await second.context.close()}
});
test('mobile room fits viewport with keyboard-size resize; reload resumes seat; expiry clears content',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {session}=await create(page);await send(page,'Mobile hello');await page.reload();await expect(page.locator('.chat-message-text')).toHaveText('Mobile hello');expect((await pool.query('SELECT count(*) FROM whisper_members WHERE room=$1',[session.id])).rows[0].count).toBe('1');
 await page.setViewportSize({width:390,height:470});await expect(page.getByRole('button',{name:'Gửi',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/chat-mobile.png'});
 await pool.query("UPDATE whisper_rooms SET expires_at=now()-interval '1 second' WHERE id=$1",[session.id]);await expect(page.locator('.chat-ended')).toContainText('tan biến',{timeout:12000});expect(await page.evaluate(()=>sessionStorage.getItem('whisper-chat-session'))).toBe(null);
});

test('retry after a lost send response does not duplicate a committed message',async({page})=>{
 const {session}=await create(page);await page.route('**/api/rooms/*/send',async route=>{await route.fetch();await route.abort('failed')});
 await page.getByRole('textbox',{name:'Nói gì đó nhé…'}).fill('Only once');await page.getByRole('button',{name:'Gửi',exact:true}).click();
 await expect(page.getByRole('button',{name:'Gửi',exact:true})).toBeEnabled();await expect(page.locator('.chat-message-text')).toHaveText('Only once');await page.unroute('**/api/rooms/*/send');await page.getByRole('button',{name:'Gửi',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Nói gì đó nhé…'})).toBeEmpty();await expect(page.locator('.chat-message-text')).toHaveCount(1);expect((await pool.query('SELECT sent FROM whisper_rooms WHERE id=$1',[session.id])).rows[0].sent).toBe(1);
});

test('official scroller preserves reading position, jumps to latest, and menus support keyboard',async({page,browser})=>{
 await page.setViewportSize({width:900,height:620});const {url,session}=await create(page,{mode:'rolling',limit:50});const second=await guest(browser,url,'Guest');
 try{
  for(let n=1;n<=14;n++)await send(page,`Line ${n}: `+'A longer message to make the history scroll. '.repeat(3));
  await expect(second.page.locator('.chat-message-text')).toHaveCount(14);
  await second.page.locator('.chat-log').hover();await second.page.mouse.wheel(0,-10000);await expect.poll(()=>second.page.locator('.chat-log').evaluate(el=>el.scrollTop)).toBeLessThan(80);
  await expect(second.page.getByRole('button',{name:'Tin nhắn mới',exact:true})).toBeVisible();
  await send(page,'New while reading earlier messages');await expect(second.page.locator('.chat-message-text')).toHaveCount(15);
  expect(await second.page.locator('.chat-log').evaluate(el=>el.scrollTop)).toBeLessThan(80);
  await second.page.getByRole('button',{name:'Tin nhắn mới',exact:true}).click();
  await expect.poll(()=>second.page.locator('.chat-log').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(10);
  await second.page.locator('.chat-message').last().locator('[data-slot=bubble-content]').focus();const actions=second.page.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).last();await actions.focus();await second.page.keyboard.press('Enter');
  await expect(second.page.getByRole('menuitem',{name:'Trả lời',exact:true})).toBeFocused();await second.page.keyboard.press('Escape');await expect(actions).toBeFocused();
  await second.page.locator('#theme-toggle').click();await second.page.screenshot({path:'test-results/chat-dark-scroller.png'});
  // End only this test's room, including all test messages.
  await page.evaluate(async s=>fetch(`/api/rooms/${s.id}/destroy`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({member:s.member})}),session);
 }finally{await second.context.close()}
});

test('compact reactions and message actions stay attached to short and long bubbles on both sides',async({page,browser})=>{

 const {url}=await create(page);const second=await guest(browser,url,'Guest');
 try{
  await send(page,'hi');await expect(second.page.locator('.chat-message-text')).toHaveText('hi');
  await second.page.locator('.chat-message').first().locator('[data-slot=bubble-content]').hover();await second.page.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await second.page.locator('.chat-quick-emojis').getByRole('button',{name:'❤️',exact:true}).click();
  await send(second.page,'yo');await expect(page.locator('.chat-message-text')).toHaveCount(2);
  await page.locator('.chat-message').last().locator('[data-slot=bubble-content]').hover();await page.locator('.chat-message').last().getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await page.locator('.chat-quick-emojis').getByRole('button',{name:'👍',exact:true}).click();
  await expect(page.locator('.chat-reactions')).toHaveCount(2);
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:760});
   await page.screenshot({path:`/tmp/whisper-reactions-${width}.png`});
   for(const row of await page.locator('.chat-message').all()){
    const bounds=await row.evaluate(el=>{
     const bubble=el.querySelector('[data-slot=bubble-content]').getBoundingClientRect();const actions=el.querySelector('.chat-message-actions').getBoundingClientRect();const reaction=el.querySelector('.chat-reactions').getBoundingClientRect();const footer=el.querySelector('[data-slot=message-footer]').getBoundingClientRect();
     return {gap:Math.max(actions.left-bubble.right,bubble.left-actions.right),reactionHeight:reaction.height,reactionBottom:reaction.bottom,footerTop:footer.top};
    });
    expect(bounds.gap).toBeGreaterThanOrEqual(2);expect(bounds.gap).toBeLessThanOrEqual(8);expect(bounds.reactionHeight).toBeLessThanOrEqual(26);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`/tmp/whisper-reactions-${width}.png`});
  }
  await page.locator('.chat-message').first().locator('[data-slot=bubble-content]').hover();await page.locator('.chat-message').first().getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await page.locator('.chat-quick-emojis').getByRole('button',{name:'❤️',exact:true}).click();
  const sharedReaction=page.locator('.chat-message').first().getByRole('button',{name:'❤️ 2',exact:true});await expect(sharedReaction).toBeVisible();await expect(sharedReaction).toContainText('2');await sharedReaction.click();await page.getByRole('button',{name:'Gỡ cảm xúc của bạn',exact:true}).click();await expect(page.locator('.chat-message').first().getByRole('button',{name:'❤️ 1',exact:true})).toBeVisible();
  await send(page,'Long message '+ 'long text '.repeat(30));await expect(page.locator('.chat-message').last().locator('[data-slot=bubble-content]')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#theme-toggle').click();await expect.poll(()=>page.locator('.chat-app').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(21, 21, 21)');await page.screenshot({path:'/tmp/whisper-reactions-dark.png'});
 }finally{await second.context.close()}
});

test('grouped avatars, hover-only desktop time and tap-to-toggle touch time behave like a conversation',async({page,browser})=>{
 const {url}=await create(page);const second=await guest(browser,url,'Guest');let phone;
 try{
  await send(page,'First line');await send(page,'Second line');
  for(const text of ['hello','one more thing','😍'])await send(second.page,text);
  await expect(page.locator('.chat-message')).toHaveCount(5);
  const incoming=page.locator('.chat-message:not(.chat-mine)');await expect(incoming).toHaveCount(3);
  await expect(incoming.locator('.chat-avatar:not(.chat-avatar-continuation)')).toHaveCount(1);
  await expect(incoming.last().getByRole('img',{name:'Guest',exact:true})).toBeVisible();
  const avatarGap=await incoming.last().evaluate(el=>Math.abs(el.querySelector('.chat-avatar').getBoundingClientRect().bottom-el.querySelector('[data-slot=bubble-content]').getBoundingClientRect().bottom));expect(avatarGap).toBeLessThan(2);
  const columns=await incoming.evaluateAll(rows=>rows.map(el=>el.querySelector('.chat-message-text').getBoundingClientRect().left));
  expect(Math.max(...columns)-Math.min(...columns)).toBeLessThanOrEqual(1);
  const nameColumn=await incoming.first().locator('[data-slot=message-header]').evaluate(el=>el.getBoundingClientRect().left+parseFloat(getComputedStyle(el).paddingLeft));expect(Math.abs(nameColumn-columns[0])).toBeLessThanOrEqual(1);
  for(const time of await page.locator('.chat-message-time').all())await expect(time).toBeHidden();
  await incoming.last().locator('[data-slot=bubble-content]').hover();await expect(page.getByRole('tooltip')).toBeVisible();await expect(page.getByRole('tooltip')).toContainText(/\d{2}:\d{2}/);
  await page.locator('.site-header').hover();await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.screenshot({path:'/tmp/whisper-grouped-desktop.png'});
  phone=await browser.newContext({locale:'vi-VN',hasTouch:true,isMobile:true,viewport:{width:390,height:844},deviceScaleFactor:1});const mobile=await phone.newPage();await mobile.goto(url);await mobile.locator('#chat-name').fill('Phone');await mobile.getByRole('button',{name:'Vào phòng',exact:true}).click();
  await expect(mobile.locator('.chat-message')).toHaveCount(5);const last=mobile.locator('.chat-message').last();const surface=last.locator('[data-slot=bubble-content]');
  await expect(last.locator('.chat-message-time')).toBeHidden();await expect(last.getByRole('button',{name:'Thao tác tin nhắn',exact:true})).toHaveCount(0);
  await surface.tap();await expect(last.locator('.chat-message-time')).toBeVisible();await expect(last.getByRole('button',{name:'Thao tác tin nhắn',exact:true})).toBeVisible();await expect(mobile.getByRole('tooltip')).toHaveCount(0);
  const mobileColumns=await mobile.locator('.chat-message:not(.chat-mine)').evaluateAll(rows=>rows.map(el=>el.querySelector('.chat-message-text').getBoundingClientRect().left));expect(Math.max(...mobileColumns)-Math.min(...mobileColumns)).toBeLessThanOrEqual(1);
  await mobile.screenshot({path:'/tmp/whisper-grouped-touch-expanded.png'});
  await surface.tap();await expect(last.locator('.chat-message-time')).toBeHidden();await expect(last.getByRole('button',{name:'Thao tác tin nhắn',exact:true})).toHaveCount(0);
  await send(page,'https://example.com');await expect(mobile.locator('.chat-message')).toHaveCount(6);const linkRow=mobile.locator('.chat-message').last();await linkRow.locator('.chat-text-link').tap();await expect(mobile.getByRole('dialog')).toBeVisible();await expect(linkRow).toHaveAttribute('data-time-open','false');await mobile.getByRole('dialog').getByRole('button',{name:'Huỷ',exact:true}).tap();
  await mobile.screenshot({path:'/tmp/whisper-grouped-touch.png'});expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await phone?.close();await second.context.close()}
});

test('lazy local emoji picker inserts custom emoji at caret, sends and reacts across two browsers without external emoji requests',async({page,browser})=>{
 const errors=[],violations=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!=='http://localhost:8788')remote.push(r.url())});
 await page.addInitScript(()=>{window.emojiCSP=[];document.addEventListener('securitypolicyviolation',e=>window.emojiCSP.push(e.violatedDirective+' '+e.blockedURI+' '+e.sourceFile+':'+e.lineNumber))});
 const {url}=await create(page);const second=await guest(browser,url,'Guest');try{
 expect(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/picker-.*\.js/.test(r.name)))).toBe(false);
 const composer=page.getByRole('textbox',{name:'Nói gì đó nhé…'});await composer.fill('hello world');await composer.press('Home');
 await page.getByRole('button',{name:'Chọn emoji',exact:true}).click();await expect(page.getByRole('searchbox')).toBeVisible();await page.getByRole('searchbox').fill('hello');await expect(page.locator('whisper-emoji-picker').getByRole('button',{name:'hello',exact:true})).toBeVisible();await page.screenshot({path:'/tmp/whisper-emoji-search.png'});await page.locator('whisper-emoji-picker').getByRole('button',{name:'hello',exact:true}).click();await expect(composer.locator('img')).toHaveAttribute('alt',':whisper_hello:');
 await page.getByRole('button',{name:'Gửi',exact:true}).click();await expect(second.page.locator('.chat-message-text img')).toHaveAttribute('alt',':whisper_hello:');await expect(second.page.locator('.chat-message-text')).toHaveText('hello world');
 const row=page.locator('.chat-message').first();await row.locator('[data-slot=bubble-content]').hover();await row.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await page.getByRole('button',{name:'Thêm cảm xúc',exact:true}).click();await page.getByRole('searchbox').fill('hello');await page.locator('whisper-emoji-picker').getByRole('button',{name:'hello',exact:true}).click();await expect(second.page.locator('.chat-reactions img')).toHaveAttribute('alt',':whisper_hello:');
 await row.getByRole('button',{name:':whisper_hello: 1',exact:true}).click();await expect(page.locator('.chat-reaction-people')).toContainText('Cảm xúc');await page.screenshot({path:'/tmp/whisper-emoji-reactors.png'});await page.keyboard.press('Escape');
 await row.locator('[data-slot=bubble-content]').hover();await row.getByRole('button',{name:'Thao tác tin nhắn',exact:true}).click();await page.getByRole('menuitem',{name:'Trả lời',exact:true}).click();await page.screenshot({path:'/tmp/whisper-emoji-reply-composer.png'});await send(page,'A neat reply');await page.screenshot({path:'/tmp/whisper-emoji-reply.png'});
 for(const current of await page.locator('.chat-message').all()){const position=await current.evaluate(el=>{const react=el.querySelector('.chat-react-picker').getBoundingClientRect();const more=el.querySelector('[data-slot=dropdown-menu-trigger]').getBoundingClientRect();return {mine:el.classList.contains('chat-mine'),react:react.x,more:more.x}});expect(position.mine?position.more<position.react:position.react<position.more).toBe(true)}
 await page.setViewportSize({width:390,height:700});await page.getByRole('button',{name:'Chọn emoji',exact:true}).click();await expect(page.getByRole('searchbox')).toBeVisible();await page.screenshot({path:'/tmp/whisper-emoji-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);violations.push(...await page.evaluate(()=>window.emojiCSP));expect(violations.filter(v=>/assets\/picker-/.test(v))).toEqual([]);await expect(page.locator('whisper-emoji-picker').locator('style')).toHaveCount(0);await expect(page.locator('whisper-emoji-picker').locator('link[rel=stylesheet]')).toHaveCount(2);expect(await page.locator('whisper-emoji-picker').evaluate(host=>getComputedStyle(host.shadowRoot.querySelector('.scroll'),'::-webkit-scrollbar').width)).toBe('8px');await test.info().attach('CSP observations',{body:JSON.stringify(violations),contentType:'application/json'});expect(errors).toEqual([]);expect(remote).toEqual([]);
 }finally{await second.context.close()}
});

test('reaction strip is compact and full picker has no unused side gutter on desktop and mobile',async({page})=>{
 await create(page);await send(page,'Compact reactions');
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:760});const row=page.locator('.chat-message').first();await row.locator('[data-slot=bubble-content]').hover();await row.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();
  await expect(page.locator('.chat-quick-reaction-picker')).toBeVisible();await expect(page.getByRole('searchbox')).toHaveCount(0);const strip=await page.locator('.chat-quick-reaction-picker').boundingBox();expect(strip.height).toBeLessThanOrEqual(52);expect(strip.width).toBeLessThanOrEqual(286);await page.screenshot({path:`/tmp/whisper-compact-strip-${width}.png`});
  await page.getByRole('button',{name:'Thêm cảm xúc',exact:true}).click();await expect(page.getByRole('searchbox')).toBeVisible();
  const dimensions=await page.locator('whisper-emoji-picker').evaluate(el=>({outer:el.getBoundingClientRect().width,inner:el.shadowRoot.querySelector('#root').getBoundingClientRect().width}));expect(Math.abs(dimensions.outer-dimensions.inner)).toBeLessThanOrEqual(2);await page.screenshot({path:`/tmp/whisper-compact-picker-${width}.png`});await page.keyboard.press('Escape');
 }
});


test('Pepe preview pack is selectable in composer and reactions, loads locally for both participants',async({page,browser})=>{
 const {url}=await create(page);const second=await guest(browser,url,'Guest');try{
 await page.getByRole('button',{name:'Chọn emoji',exact:true}).click();await page.getByRole('button',{name:'Pepe',exact:true}).click();await expect(page.locator('whisper-emoji-picker').getByRole('button',{name:'happy',exact:true})).toBeVisible();await expect(page.locator('whisper-emoji-picker').getByRole('button',{name:'wine',exact:true})).toBeInViewport();expect((await page.locator('.chat-picker-host').boundingBox()).height).toBeLessThan(200);await page.screenshot({path:'/tmp/whisper-pepe-picker.png'});await page.locator('whisper-emoji-picker').getByRole('button',{name:'happy',exact:true}).click();await expect(page.locator('.chat-emoji-composer img')).toHaveAttribute('alt',':pepe_preview_happy:');await page.getByRole('button',{name:'Gửi',exact:true}).click();await expect(second.page.locator('.chat-message-text img')).toHaveAttribute('alt',':pepe_preview_happy:');expect(await second.page.locator('.chat-message-text img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 const row=second.page.locator('.chat-message').first();await row.locator('[data-slot=bubble-content]').hover();await row.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await second.page.getByRole('button',{name:'Thêm cảm xúc',exact:true}).click();await second.page.getByRole('searchbox').fill('wine');await second.page.locator('whisper-emoji-picker').getByRole('button',{name:'wine',exact:true}).click();await expect(page.locator('.chat-reactions img')).toHaveAttribute('alt',':pepe_preview_wine:');await page.screenshot({path:'/tmp/whisper-pepe-chat.png'});
 }finally{await second.context.close()}
});

test('emoji-only messages have no painted bubble; mixed text stays normal, with smooth reaction entry and expansion',async({page,browser})=>{
 const {url}=await create(page);const second=await guest(browser,url,'Guest');try{
 await send(page,'🥰');await send(page,'🥲');await send(page,'haha 😂');await send(second.page,'👩🏽‍🚀 🇻🇳');await expect(page.locator('.chat-message')).toHaveCount(4);
 for(const n of [0,1,3]){const bubble=page.locator('.chat-message').nth(n).locator('[data-slot=bubble]');await expect(bubble).toHaveClass(/(?:^|\s)chat-emoji-only(?:\s|$)/);const style=await bubble.locator('[data-slot=bubble-content]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,font:parseFloat(getComputedStyle(el.querySelector('.chat-message-text')).fontSize)}));expect(style.background).toBe('rgba(0, 0, 0, 0)');expect(style.font).toBeGreaterThanOrEqual(34)}
 await expect(page.locator('.chat-message').nth(2).locator('[data-slot=bubble]')).not.toHaveClass(/(?:^|\s)chat-emoji-only(?:\s|$)/);
 await page.screenshot({path:'/tmp/whisper-emoji-only-desktop.png'});
 const row=page.locator('.chat-message').first();await row.locator('[data-slot=bubble-content]').hover();await row.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();const strip=page.locator('.chat-quick-reaction-picker');await expect(strip).toBeVisible();expect(await strip.evaluate(el=>getComputedStyle(el).animationName)).toBe('chat-picker-in');
 await page.evaluate(()=>{window.popupMotion=[];const record=()=>{const el=document.querySelector('.chat-full-emoji-picker');if(el)window.popupMotion.push({time:performance.now(),transform:getComputedStyle(el).transform,active:el.getAnimations().filter(a=>a.playState==='running').length});if(window.popupMotion.length<28)requestAnimationFrame(record)};requestAnimationFrame(record)});
 await page.getByRole('button',{name:'Thêm cảm xúc',exact:true}).click();await expect(page.getByRole('searchbox')).toBeVisible();await page.locator('.chat-full-emoji-picker').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))});
 const frames=await page.evaluate(()=>window.popupMotion);expect(frames.some(f=>f.active>0)).toBe(true);expect(new Set(frames.map(f=>f.transform)).size).toBeGreaterThan(1);
 await page.getByRole('searchbox').fill('wine');await page.locator('whisper-emoji-picker').getByRole('button',{name:'wine',exact:true}).click();await expect(row.locator('.chat-reactions img')).toHaveAttribute('alt',':pepe_preview_wine:');await page.setViewportSize({width:390,height:844});await expect(page.locator('.chat-full-emoji-picker')).toHaveCount(0);await expect(row.locator('[data-slot=bubble]')).toHaveClass(/(?:^|\s)chat-emoji-only(?:\s|$)/);expect(await row.locator('[data-slot=bubble-content]').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');await page.screenshot({path:'/tmp/whisper-emoji-only-mobile.png'});
 const emoji=page.locator('.chat-message').first().locator('[data-slot=bubble-content]');await expect(emoji).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await second.context.close()}
});

test('reaction UI respects reduced motion and opens the expanded picker without animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await create(page);await send(page,'Reduced motion');const row=page.locator('.chat-message');await row.locator('[data-slot=bubble-content]').hover();await row.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await expect(page.locator('.chat-quick-reaction-picker')).toBeVisible();expect(await page.locator('.chat-quick-reaction-picker').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.getByRole('button',{name:'Thêm cảm xúc',exact:true}).click();await expect(page.getByRole('searchbox')).toBeVisible();expect(await page.locator('.chat-full-emoji-picker').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
});

test('chat shares composer chrome, mascot thought cloud and theme transition without overflow',async({page})=>{
 await page.goto('/');
 const chrome=await page.locator('.site-header').evaluate(el=>{const mark=el.querySelector('.brand-mark').getBoundingClientRect();return {height:el.getBoundingClientRect().height,mark:mark.width}});
 await page.goto('/chat');
 const roomChrome=await page.locator('.site-header').evaluate(el=>{const mark=el.querySelector('.brand-mark').getBoundingClientRect();return {height:el.getBoundingClientRect().height,mark:mark.width}});
 expect(roomChrome).toEqual(chrome);
 await expect(page.locator('.chat-companion .eyt-ball')).toBeVisible();
 await expect(page.locator('.chat-companion .thought-shape')).toHaveCount(1);
 await expect(page.locator('.chat-companion .thought-dot')).toHaveCount(2);
 const old=await page.locator('html').getAttribute('data-theme');
 await page.locator('#theme-toggle').click();
 await expect(page.locator('html')).toHaveAttribute('data-theme',old==='dark'?'light':'dark');
 await create(page);await send(page,'Layout dùng chung, hội thoại vẫn hoạt động.');
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:780});
  await expect(page.getByRole('button',{name:'Gửi',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  const face=await page.locator('.chat-companion .eyt-ball').boundingBox();expect(face.width).toBeGreaterThanOrEqual(36);
  await page.screenshot({path:`/tmp/whisper-shared-layout-${width}.png`});
 }
});

test('quiet chat hides secondary setup and composer copy while keeping controls accessible',async({page})=>{
 await page.goto('/chat');
 await expect(page.locator('.chat-more-settings')).not.toHaveAttribute('open');
 await expect(page.locator('#chat-mode')).toBeHidden();await expect(page.locator('#chat-limit')).toBeHidden();
 await page.screenshot({path:'/tmp/whisper-quiet-lobby.png'});
 await create(page);await send(page,'Một màn hình gọn hơn.');
 await expect(page.locator('.chat-policy')).toHaveCount(0);
 await expect(page.locator('.chat-compose-hint')).toBeEmpty();
 const invite=page.getByRole('button',{name:'Copy lời mời',exact:true});await expect(invite).toBeVisible();await expect(invite).toHaveText('');
 for(const width of [1280,390]){await page.setViewportSize({width,height:780});await page.screenshot({path:`/tmp/whisper-quiet-room-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await page.getByRole('button',{name:'Thành viên',exact:true}).click();await expect(page.locator('.chat-room-limit')).toContainText('1 / 10');
});

test('message layout matrix covers both sides, real file upload, cards, quotes and reactions at narrow widths',async({page,browser})=>{
 test.setTimeout(120000);
 const {mkdir,writeFile,readFile}=await import('node:fs/promises');const sharp=(await import('sharp')).default;
 const dir='/tmp/whisper-layout-qc';await mkdir(dir,{recursive:true});
 const filename='Ke-hoach-chuyen-di-va-danh-sach-vat-dung-can-chuan-bi-cho-hai-nguoi-phien-ban-moi-nhat.txt';
 const body='Whisper UI QC\nA small file created for a real encrypted upload/download round trip.\n';
 await writeFile(`${dir}/${filename}`,body);await writeFile(`${dir}/expenses.csv`,'item,amount\ntrain,128\ncoffee,32\n');
 await sharp({create:{width:240,height:160,channels:4,background:'#759694'}}).png().toFile(`${dir}/sample.png`);
 const {url}=await create(page,{mode:'rolling',limit:50});const second=await guest(browser,url,'Guest with a longer name');
 const longURL='https://example.com/a-very-long-route/'+('long-section-'.repeat(18))+'?search='+('x'.repeat(120));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const client of [page,second.page]){
   for(const value of ['Short text','😍',':pepe_preview_happy:','First line\nSecond line\n'+'longword'.repeat(40),longURL,'Take a look: https://example.com/safe']){if(value.startsWith(':pepe_')){await client.getByRole('textbox',{name:'Nói gì đó nhé…'}).fill(value);await client.getByRole('button',{name:'Gửi',exact:true}).click();await expect(client.getByRole('textbox',{name:'Nói gì đó nhé…'})).toBeEmpty()}else await send(client,value)}
   await client.locator('input[type=file]').setInputFiles(`${dir}/${filename}`);await client.getByRole('button',{name:'Gửi',exact:true}).click();await expect(client.locator('.chat-attachment').last()).toContainText(filename);
   await client.locator('input[type=file]').setInputFiles(`${dir}/sample.png`);await client.getByRole('button',{name:'Gửi',exact:true}).click();await expect(client.locator('.chat-attachment').last()).toContainText('sample.png');
   await client.locator('input[type=file]').setInputFiles(`${dir}/expenses.csv`);await send(client,'Trip expenses');
  }
  await expect(page.locator('.chat-message')).toHaveCount(18);
  await page.locator('.chat-message').last().locator('[data-slot=bubble-content]').hover();await page.locator('.chat-message').last().getByRole('button',{name:'Thao tác tin nhắn',exact:true}).click();await page.getByRole('menuitem',{name:'Trả lời',exact:true}).click();await send(page,'A reply with a quote');
  const last=page.locator('.chat-message').last();await last.locator('[data-slot=bubble-content]').hover();await last.getByRole('button',{name:'Thả cảm xúc',exact:true}).click();await page.locator('.chat-quick-emojis').getByRole('button',{name:'❤️',exact:true}).click();await expect(last.locator('.chat-reactions')).toBeVisible();
  // The received file downloads byte-for-byte, through the normal confirmation UI.
  await second.page.getByRole('button',{name:'Tải file đính kèm: '+filename,exact:true}).first().click();const pending=second.page.waitForEvent('download');await second.page.getByRole('dialog').getByRole('button',{name:'Tải file đính kèm',exact:true}).click();const downloaded=await pending;expect(await readFile(await downloaded.path(),'utf8')).toBe(body);
  for(const theme of ['light','dark'])for(const viewport of [{width:1280,height:900},{width:768,height:780},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.evaluate(value=>{document.documentElement.dataset.theme=value},theme);
   const geometry=await page.locator('.chat-message').evaluateAll(rows=>rows.map(row=>{
    const bubble=row.querySelector('[data-slot=bubble-content]').getBoundingClientRect(),action=row.querySelector('.chat-message-actions').getBoundingClientRect(),room=row.closest('.chat-room').getBoundingClientRect(),quote=row.querySelector('.chat-reply-quote')?.getBoundingClientRect(),avatar=row.querySelector('.chat-avatar')?.getBoundingClientRect();
    return {mine:row.classList.contains('chat-mine'),left:bubble.left,right:bubble.right,roomLeft:room.left,roomRight:room.right,gap:Math.max(action.left-bubble.right,bubble.left-action.right),quoteLeft:quote?.left,avatarBottom:avatar?.bottom,bottom:bubble.bottom};
   }));
   for(const item of geometry){expect(item.left).toBeGreaterThanOrEqual(item.roomLeft-1);expect(item.right).toBeLessThanOrEqual(item.roomRight+1);expect(item.gap).toBeGreaterThanOrEqual(2);expect(item.gap).toBeLessThanOrEqual(8);if(item.avatarBottom!==undefined)expect(Math.abs(item.avatarBottom-item.bottom)).toBeLessThanOrEqual(1);if(!item.mine&&item.quoteLeft!==undefined)expect(Math.abs(item.quoteLeft-item.left)).toBeLessThanOrEqual(1)}
   const containedCards=await page.locator('.chat-link-card,.chat-attachment').evaluateAll(cards=>cards.map(card=>{const c=card.getBoundingClientRect(),b=card.closest('[data-slot=bubble-content]').getBoundingClientRect();return c.left>=b.left-1&&c.right<=b.right+1}));expect(containedCards.every(Boolean)).toBe(true);
   const incoming=geometry.filter(item=>!item.mine),outgoing=geometry.filter(item=>item.mine);expect(Math.max(...incoming.map(i=>i.left))-Math.min(...incoming.map(i=>i.left))).toBeLessThanOrEqual(1);expect(Math.max(...outgoing.map(i=>i.right))-Math.min(...outgoing.map(i=>i.right))).toBeLessThanOrEqual(1);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.locator('.chat-message').nth(13).scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/cards-${theme}-${viewport.width}.png`});
  }
  expect(errors).toEqual([]);
 }finally{await second.context.close()}
});

test('typing the next message while a file is uploading preserves the new draft',async({page})=>{
 await create(page);let release;const gate=new Promise(resolve=>{release=resolve});let arrived;const received=new Promise(resolve=>{arrived=resolve});
 await page.route('**/api/rooms/*/send',async route=>{const response=await route.fetch();arrived();await gate;await route.fulfill({response})},{times:1});
 try{
  await page.locator('input[type=file]').setInputFiles({name:'draft-check.txt',mimeType:'text/plain',buffer:Buffer.from('Draft preservation check')});await page.getByRole('button',{name:'Gửi',exact:true}).click();await received;
  await page.getByRole('textbox',{name:'Nói gì đó nhé…'}).fill('Keep this next draft');release();
  await expect(page.locator('.chat-attachment')).toContainText('draft-check.txt');await expect(page.getByRole('button',{name:'Gửi',exact:true})).toBeEnabled();await expect(page.getByRole('textbox',{name:'Nói gì đó nhé…'})).toHaveText('Keep this next draft');
  await page.getByRole('button',{name:'Gửi',exact:true}).click();await expect(page.locator('.chat-message-text')).toHaveText('Keep this next draft');
 }finally{release()}
});

test('Open Graph cards render image title description and domain without leaking external image requests',async({page})=>{
 const sharp=(await import('sharp')).default;const image=await sharp({create:{width:600,height:314,channels:3,background:'#447778'}}).png().toBuffer();
 await page.route('**/api/rooms/*/preview',route=>route.fulfill({json:{title:'Meta Tags — Preview, Edit and Generate',description:'A clear image, title and short description, with the destination shown underneath.',image:{type:'image/png',data:image.toString('base64')}}}));
 await create(page);await send(page,'https://metatags.io/');const card=page.locator('.chat-link-card');await expect(card.locator('strong')).toHaveText('Meta Tags — Preview, Edit and Generate');await expect(card.locator('.chat-link-description')).toBeVisible();await expect(card.locator('img')).toHaveAttribute('src',/^blob:/);await expect.poll(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 for(const theme of ['light','dark'])for(const width of [1280,390,320]){await page.setViewportSize({width,height:844});await page.evaluate(value=>{document.documentElement.dataset.theme=value},theme);await page.screenshot({path:`/tmp/whisper-layout-qc/og-${theme}-${width}.png`});const b=await card.boundingBox();expect(b.x+b.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await card.click();await expect(page.getByRole('dialog').locator('code')).toHaveText('https://metatags.io/');await page.getByRole('button',{name:'Huỷ',exact:true}).click();
 await page.route('**/api/rooms/*/preview',route=>route.fulfill({status:422,json:{error:'Unavailable'}}));await send(page,'https://example.org/');await expect(page.locator('.chat-link-card').last().locator('strong')).toHaveText('example.org');
});


test('chat is the fourth mode on the main screen and preserves both drafts and the room without navigation',async({page,browser})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.locator('#message').fill('Keep my private note');
 await page.evaluate(()=>window.__modeQC=42);
 await page.locator('#room-mode').click();await expect(page.locator('.chat-lobby')).toBeVisible();await expect(page).toHaveURL('/?mode=chat');
 await page.locator('#chat-name').fill('Host');await page.getByRole('button',{name:'Tạo phòng',exact:true}).click();await expect(page.locator('.chat-room')).toBeVisible();
 await send(page,'Room survives mode changes');await page.getByRole('textbox',{name:'Nói gì đó nhé…'}).fill('Unsent chat draft');
 const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('whisper-chat-session')));
 await page.locator('#text-mode').click();await expect(page).toHaveURL('/');await expect(page.locator('#message')).toHaveValue('Keep my private note');await expect(page.locator('.chat-room')).toBeHidden();
 await page.locator('#audio-mode').click();await expect(page.locator('#voice-stage')).toBeVisible();
 await page.locator('#music-mode').click();await expect(page.locator('#music-stage')).toBeVisible();
 await page.locator('#room-mode').click();await expect(page.locator('.chat-room')).toBeVisible();await expect(page.locator('#music-stage')).toBeHidden();await expect(page.getByRole('textbox',{name:'Nói gì đó nhé…'})).toHaveText('Unsent chat draft');await expect(page.locator('.chat-message-text')).toHaveText('Room survives mode changes');
 expect(await page.evaluate(()=>window.__modeQC)).toBe(42);expect(await page.locator('.site-header').count()).toBe(1);
 const fresh=await guest(browser,`http://localhost:8788/?mode=chat#r=${session.id}&a=${session.access}&k=${session.key}`,'Friend');
 try{await expect(fresh.page.locator('.chat-message-text')).toHaveText('Room survives mode changes');await expect(fresh.page).toHaveURL('/?mode=chat')}finally{await fresh.context.close()}
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await expect(page.locator('#room-mode')).toBeInViewport();await expect(page.getByRole('button',{name:'Gửi',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);await page.screenshot({path:`/tmp/whisper-integrated-chat-${width}.png`})}
 await page.reload();await expect(page.locator('.chat-room')).toBeVisible();await expect(page.locator('.chat-message-text')).toHaveText('Room survives mode changes');expect(errors).toEqual([]);
});
