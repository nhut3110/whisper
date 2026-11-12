import {test,expect} from '@playwright/test';
async function paste(page,html,text='',target='#message'){
 await page.locator(target).evaluate((el,{html,text})=>{el.focus();const data=new DataTransfer();if(html)data.setData('text/html',html);data.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))},{html,text});
 await expect(page.locator('#rich-editor')).toBeVisible();
}
async function select(page,selector){await page.locator(selector).evaluate(el=>{el.closest('[contenteditable]')?.focus();const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range)});await expect(page.locator('#rich-toolbar')).toBeVisible()}
async function block(page,query){await page.goto('/');await page.locator('#message').fill('/'+query);await expect(page.locator('#block-picker')).toBeVisible();await page.keyboard.press('Enter');await expect(page.locator('#rich-editor')).toBeVisible()}
test('Notion-style clipboard spans keep semantic formatting while unsafe markup is removed',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');
 await paste(page,'<meta charset="utf-8"><div data-block-id="notion-example"><h2>From Notion</h2><p><span style="font-weight:600">Bold</span> <span style="font-style:italic">Italic</span> <span style="text-decoration:line-through">Strike</span> <span style="text-decoration:underline">Underline</span> <span data-notion-highlight="yellow_background">Highlight</span><div class="notion-inline-code-container"><span>const x = 1</span></div></p><ul><li><input type="checkbox" checked>Done</li></ul><a href="https://example.com">Safe</a><img src=x onerror="window.pwned=true"><script>window.pwned=true</script><span style="position:fixed;background:url(https://invalid.example)">No CSS</span></div>','From Notion');
 const root=page.locator('#rich-editor');await expect(root.locator('strong')).toHaveText('Bold');await expect(root.locator('em')).toHaveText('Italic');await expect(root.locator('s')).toHaveText('Strike');await expect(root.locator('u')).toHaveText('Underline');await expect(root.locator('code')).toHaveText('const x = 1');await expect(root.locator('[data-highlight=yellow]')).toHaveText('Highlight');await expect(root.locator('li[data-checked=true]')).toHaveText('Done');await expect(root.locator('[style],script,img,input,[class]')).toHaveCount(0);
 await page.locator('#copy-draft').click();let html='';await expect.poll(async()=>{html=await page.evaluate(async()=>{try{const items=await navigator.clipboard.read(),item=items.find(i=>i.types.includes('text/html'));return item?(await item.getType('text/html')).text():''}catch{return ''}});return html}).toContain('<strong>Bold</strong>');expect(html).toContain('<strong>Bold</strong>');expect(html).toContain('data-checked="true"');expect(html).not.toContain('style=');expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
test('Markdown pasted into an existing rich editor renders headings lists and tables immediately',async({page})=>{
 await page.goto('/');await paste(page,'<p>Intro</p>','Intro');await page.locator('#rich-editor').press('ControlOrMeta+End');
 await paste(page,'','\n\n## Markdown title\n\n- First\n- Second\n\n| A | B |\n| --- | --- |\n| 1 | 2 |','#rich-editor');
 await expect(page.locator('#rich-editor h2')).toHaveText('Markdown title');await expect(page.locator('#rich-editor li')).toHaveText(['First','Second']);await expect(page.locator('#rich-editor table')).toBeVisible();
});
for(const [query,selector] of [['todo','ul[data-kind=task] li[data-checked=false]'],['toggle','details summary'],['callout','aside[data-kind=callout]'],['divider','hr'],['table','table']])test(`slash inserts ${query} with usable structure`,async({page})=>{
 await block(page,query);await expect(page.locator('#rich-editor '+selector)).toBeVisible();if(query==='table'){await page.keyboard.press('Tab');await page.keyboard.type('Cell two');await expect(page.locator('#rich-editor th').nth(1)).toHaveText('Cell two')}
});
test('block handle aligns with the hovered row; pointer move and native undo preserve block order',async({page})=>{
 await page.goto('/');await paste(page,'<p>First line</p><p>Second line</p><p>Third line</p>','First line\nSecond line\nThird line');
 const rows=page.locator('#rich-editor>p');await rows.first().hover();await expect(page.locator('#block-gutter')).toHaveAttribute('data-visible','');
 await expect.poll(async()=>{const row=await rows.first().boundingBox(),handle=await page.locator('#block-gutter').boundingBox();return Math.abs(handle.y+handle.height/2-(row.y+row.height/2))}).toBeLessThan(4);
 const handle=await page.locator('#move-block').boundingBox(),last=await rows.last().boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,last.y+last.height-2,{steps:12});await expect(page.locator('#block-drop-line')).toBeVisible();await page.mouse.up();
 await expect(rows).toHaveText(['Second line','Third line','First line']);await page.keyboard.press('ControlOrMeta+z');await expect(rows).toHaveText(['First line','Second line','Third line']);await expect(page.locator('.moving-block')).toHaveCount(0);
 await page.screenshot({path:'test-results/writing-blocks-desktop.png'});
});
test('inline link code and colors apply to selection and survive sanitized copy',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await paste(page,'<p>A little secret</p>','A little secret');await select(page,'#rich-editor p');await page.getByRole('button',{name:'Liên kết',exact:true}).click();await page.locator('#editor-link').fill('https://example.com');await page.getByRole('button',{name:'Áp dụng',exact:true}).click();await expect(page.locator('#rich-editor a')).toHaveAttribute('href','https://example.com');
 await select(page,'#rich-editor p');await page.getByRole('button',{name:'Màu chữ',exact:true}).click();await page.locator('[data-ink=blue]').click();await page.locator('#copy-draft').click();let html='';await expect.poll(async()=>{html=await page.evaluate(async()=>{try{const items=await navigator.clipboard.read(),item=items.find(i=>i.types.includes('text/html'));return item?(await item.getType('text/html')).text():''}catch{return ''}});return html}).toContain('data-color="blue"');expect(html).toContain('data-color="blue"');
 await select(page,'#rich-editor p');await page.getByRole('button',{name:'Code trong dòng',exact:true}).click();await expect(page.locator('#rich-editor code')).toHaveText('A little secret');
});
test('mobile selection toolbar and block menu fit a narrow viewport without horizontal page scrolling',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.goto('/');await paste(page,'<p>One small message</p>','One small message');await select(page,'#rich-editor p');const r=await page.locator('#rich-toolbar').boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(320);
 await page.screenshot({path:'test-results/writing-toolbar-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('checklist callout toggle and table survive encrypted share and recipient rendering',async({page})=>{
 await page.goto('/');await paste(page,'<ul data-kind="task"><li data-checked="true">Ready</li></ul><aside data-kind="callout"><p>Remember this</p></aside><details><summary>Secret</summary><p>Inside</p></details><table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>42</td></tr></table>','Ready');
 await page.locator('#create').click();await expect(page.locator('#verify-body')).toBeVisible();const target=Number((await page.locator('#challenge-label').textContent()).match(/\d+/)[0]);await page.locator('#wake-track').focus();await page.keyboard.press('Home');for(let i=0;i<target;i++)await page.keyboard.press('ArrowRight');await page.waitForTimeout(550);await page.locator('#settings-done').click();await expect(page.locator('#created')).toBeVisible();
 const link=await page.locator('#share-link').inputValue();await page.goto(link);await expect(page.locator('#receive')).toBeVisible();await page.locator('#create').click();await page.locator('#open').click();await expect(page.locator('#plaintext li[data-checked=true]')).toContainText('Ready');await expect(page.locator('#plaintext aside')).toContainText('Remember this');await page.locator('#plaintext summary').click();await expect(page.locator('#plaintext details p')).toBeVisible();await expect(page.locator('#plaintext td').last()).toHaveText('42');
});
test('custom context paste retains clipboard rich text instead of flattening it',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.locator('#message').fill('');await page.evaluate(async()=>navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob(['From clipboard'],{type:'text/plain'}),'text/html':new Blob(['<h2>From clipboard</h2><p><strong>Keep bold</strong></p>'],{type:'text/html'})})]));
 await page.locator('#message').click({button:'right',position:{x:5,y:15}});await page.getByRole('menuitem',{name:'Dán',exact:true}).click();await expect(page.locator('#rich-editor h2')).toHaveText('From clipboard');await expect(page.locator('#rich-editor strong')).toHaveText('Keep bold');
});

test('actual Notion canvas structure imports aligned interactive tasks and nested toggle without layout wrappers',async({page})=>{
 const {readFile}=await import('node:fs/promises');const html=await readFile('tests/fixtures/notion/canvas.html','utf8');await page.goto('/');await paste(page,html,'Getting Started');
 const root=page.locator('#rich-editor');await expect(root.locator('h1')).toHaveText('Getting Started');await expect(root.locator('li[data-checked]')).toHaveCount(2);await expect(root.locator('li[data-checked=true]')).toContainText('just start typing');await expect(root.locator('details summary')).toHaveText('A few useful links');await expect(root.locator('details a')).toHaveText('Notion Help');await expect(root.locator('code')).toHaveText('however');await expect(root.locator('[class],[style],input,[contenteditable],div')).toHaveCount(0);await expect(root).not.toContainText('Add assignee');await expect(root).not.toContainText('☐');
 const li=root.locator('li[data-checked=true]'),box=await li.boundingBox();await page.mouse.click(box.x+8,box.y+12);await expect(root.locator('li[data-checked=true]')).toHaveCount(0);
 await page.screenshot({path:'test-results/notion-canvas-fixed.png'});
});
test('native Notion block MIME preserves checklist state annotations and collapsed toggle children',async({page})=>{
 const {readFile}=await import('node:fs/promises');const raw=await readFile('tests/fixtures/notion/blocks.json','utf8');await page.goto('/');
 await page.locator('#message').evaluate((el,raw)=>{el.focus();const data=new DataTransfer();data.setData('text/plain','Fallback only');data.setData('text/html','<p>Fallback only</p>');data.setData('text/_notion-blocks-v3-production',raw);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))},raw);
 const root=page.locator('#rich-editor');await expect(root.locator('li[data-checked=true]')).toContainText('Highlight');await expect(root.locator('strong')).toHaveText('style');await expect(root.locator('em')).toHaveText('your');await expect(root.locator('[data-highlight=yellow]')).toHaveText('like');await expect(root.locator('details')).not.toHaveAttribute('open');await expect(root.locator('details li')).toBeHidden();await root.locator('summary').click();await expect(root.locator('details a')).toHaveText('Notion Help');await expect(root).not.toContainText('Fallback only');await expect(root.locator('[data-color=red]')).toHaveText('Notion Help');
});
test('malformed cyclic or unsupported Notion payloads stay bounded and safe',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const {clipboard}=await import('/rich.js');
  const value={type:'toggle',content:['a'],properties:{title:[['<img src=x onerror=alert(1)>',[['a','javascript:alert(1)']]]]}};
  const raw=JSON.stringify({blocks:[{blockId:'a',blockSubtree:{block:{a:{value}}}}]});
  return {broken:clipboard('<p>Safe fallback</p>','fallback','{broken'),cycle:clipboard('','fallback',raw)};
 });
 expect(result.broken).toBe('<p>Safe fallback</p>');expect(result.cycle).toContain('&lt;img');expect(result.cycle).not.toContain('href=');expect(result.cycle.length).toBeLessThan(300);
});
