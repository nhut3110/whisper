import {test,expect} from '@playwright/test';
async function draft(page,html){await page.goto('/');await page.locator('#message').evaluate((el,html)=>{el.focus();const data=new DataTransfer();data.setData('text/html',html);data.setData('text/plain','Sample');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))},html);await expect(page.locator('#rich-editor')).toBeVisible();}
async function caret(page,selector,end=true){await page.locator(selector).first().evaluate((el,end)=>{el.closest('[contenteditable]')?.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(!end);getSelection().removeAllRanges();getSelection().addRange(range)},end);}
async function menu(page,selector){await page.locator(selector).hover();await page.locator('#move-block').click();await expect(page.locator('#block-actions')).toBeVisible();}
async function blockAction(page,action){await page.locator(`[data-block-action="${action}"]`).click();}
async function tableAction(page,action){await caret(page,'#rich-editor td');await expect(page.locator('#table-caret-tools')).toBeVisible();await page.locator('#table-caret-tools').click();await expect(page.locator('#table-actions')).toBeVisible();await page.locator(`[data-table-action="${action}"]`).click();}
const table='<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table><p>After</p>';
test('block menu duplicates moves deletes and supports native undo',async({page})=>{
 await draft(page,'<p>Alpha <strong>bold</strong></p><p>Beta</p>');const rows=page.locator('#rich-editor>p');
 await menu(page,'#rich-editor>p:first-child');await blockAction(page,'duplicate');await expect(rows).toHaveText(['Alpha bold','Alpha bold','Beta']);await expect(rows.nth(1).locator('strong')).toHaveText('bold');
 await menu(page,'#rich-editor>p:nth-child(2)');await blockAction(page,'down');await expect(rows).toHaveText(['Alpha bold','Beta','Alpha bold']);
 await menu(page,'#rich-editor>p:last-child');await blockAction(page,'delete');await expect(rows).toHaveText(['Alpha bold','Beta']);await page.keyboard.press('ControlOrMeta+z');await expect(rows).toHaveText(['Alpha bold','Beta','Alpha bold']);
});
test('turn into transforms the full block without losing inline formatting or neighboring text',async({page})=>{
 await draft(page,'<p>A <strong>bold</strong> secret</p><p>Keep me</p>');await menu(page,'#rich-editor>p:first-child');await blockAction(page,'turn');await page.locator('#block-choice-toggle').click();await expect(page.locator('#rich-editor details summary')).toHaveText('A bold secret');await expect(page.locator('#rich-editor summary strong')).toHaveText('bold');await expect(page.locator('#rich-editor>p')).toHaveText('Keep me');await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#rich-editor>p')).toHaveText(['A bold secret','Keep me']);
});
test('a list row can become a heading without losing rows before or after it',async({page})=>{
 await draft(page,'<ul><li>First</li><li>Second <em>row</em></li><li>Third</li></ul>');await menu(page,'#rich-editor li:nth-child(2)');await blockAction(page,'turn');await page.locator('#block-choice-h2').click();await expect(page.locator('#rich-editor>h2')).toHaveText('Second row');await expect(page.locator('#rich-editor h2 em')).toHaveText('row');await expect(page.locator('#rich-editor li')).toHaveText(['First','Third']);
});
test('table menu adds rows and columns while preserving values; delete supports undo',async({page})=>{
 await draft(page,table);await tableAction(page,'rowBelow');await expect(page.locator('#rich-editor tr')).toHaveCount(3);await expect(page.locator('#rich-editor tr').nth(1)).toContainText('12');
 await tableAction(page,'columnRight');await expect(page.locator('#rich-editor tr').first().locator('th,td')).toHaveCount(3);await expect(page.locator('#rich-editor td').nth(0)).toHaveText('1');
 await tableAction(page,'deleteColumn');await expect(page.locator('#rich-editor tr').first().locator('th,td')).toHaveCount(2);await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#rich-editor tr').first().locator('th,td')).toHaveCount(3);
 await tableAction(page,'headerColumn');await expect(page.locator('#rich-editor tr').nth(1).locator('th').first()).toHaveText('1');
 await page.screenshot({path:'test-results/basic-table-editor.png'});
});
test('table Tab creates a new row and undo removes only that row',async({page})=>{
 await draft(page,table);await caret(page,'#rich-editor td:last-child');await page.keyboard.press('Tab');await expect(page.locator('#rich-editor tr')).toHaveCount(3);await page.keyboard.type('New');await expect(page.locator('#rich-editor tr').last().locator('td').first()).toHaveText('New');await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#rich-editor tr')).toHaveCount(2);
});
test('list Tab nests and Shift Tab returns; task Enter starts an unchecked item then exits on empty Enter',async({page})=>{
 await draft(page,'<ul><li>One</li><li>Two</li></ul>');await caret(page,'#rich-editor li:last-child');await page.keyboard.press('Tab');await expect(page.locator('#rich-editor ul ul')).toBeVisible();await page.keyboard.press('Shift+Tab');await expect(page.locator('#rich-editor ul ul')).toHaveCount(0);
 await draft(page,'<ul data-kind="task"><li data-checked="true">Done</li></ul>');await caret(page,'#rich-editor li');await page.keyboard.press('Enter');await page.keyboard.type('Next');await expect(page.locator('#rich-editor li')).toHaveText(['Done','Next']);await expect(page.locator('#rich-editor li').last()).toHaveAttribute('data-checked','false');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.type('Outside');await expect(page.locator('#rich-editor>p')).toHaveText('Outside');
});
test('keyboard duplicate preserves a block; inline code and link shortcuts target the selection',async({page})=>{
 await draft(page,'<p>Shortcut</p>');await caret(page,'#rich-editor p');await page.keyboard.press('ControlOrMeta+Shift+d');await expect(page.locator('#rich-editor>p')).toHaveText(['Shortcut','Shortcut']);
 await page.locator('#rich-editor>p').first().evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r)});await page.keyboard.press('ControlOrMeta+e');await expect(page.locator('#rich-editor code')).toHaveText('Shortcut');
 await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#link-editor')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#link-editor')).toBeHidden();
});
test('individual list rows drag in order with native undo',async({page})=>{
 await draft(page,'<ul><li>One</li><li>Two</li><li>Three</li></ul>');await page.locator('#rich-editor li').first().hover();const handle=await page.locator('#move-block').boundingBox(),last=await page.locator('#rich-editor li').last().boundingBox();await page.mouse.move(handle.x+10,handle.y+10);await page.mouse.down();await page.mouse.move(handle.x+10,last.y+last.height-1,{steps:10});await page.mouse.up();await expect(page.locator('#rich-editor li')).toHaveText(['Two','Three','One']);await expect(page.locator('#block-actions')).toBeHidden();await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#rich-editor li')).toHaveText(['One','Two','Three']);
});
test('block and table menus stay within a narrow screen and close with Escape',async({page})=>{
 await page.setViewportSize({width:320,height:740});await draft(page,table);await tableAction(page,'rowBelow');await caret(page,'#rich-editor td');await page.locator('#table-caret-tools').click();const r=await page.locator('#table-actions').boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(320);expect(r.y+r.height).toBeLessThanOrEqual(740);await page.keyboard.press('Escape');await expect(page.locator('#table-actions')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/basic-editing-mobile.png'});
});
test('table removal and checkbox toggling can be undone without losing surrounding content',async({page})=>{
 await draft(page,table);await tableAction(page,'deleteTable');await expect(page.locator('#rich-editor table')).toHaveCount(0);await expect(page.locator('#rich-editor')).toContainText('After');await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#rich-editor table')).toBeVisible();await expect(page.locator('#rich-editor td')).toHaveText(['1','2']);
 await draft(page,'<ul data-kind="task"><li data-checked="false">Task</li></ul>');const box=await page.locator('#rich-editor li').boundingBox();await page.mouse.click(box.x+8,box.y+12);await expect(page.locator('#rich-editor li')).toHaveAttribute('data-checked','true');await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#rich-editor li')).toHaveAttribute('data-checked','false');
});
test('block copy exports formatted HTML and plain text',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await draft(page,'<p>Copy <strong>this</strong></p><p>Only one block</p>');await menu(page,'#rich-editor>p:first-child');await blockAction(page,'copy');await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('Copy this');const html=await page.evaluate(async()=>{const items=await navigator.clipboard.read();return (await items.find(item=>item.types.includes('text/html')).getType('text/html')).text()});expect(html).toContain('<strong>this</strong>');expect(html).not.toContain('Only one block');
});
test('plain-text type picker changes the whole line while preserving surrounding lines',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Before\nA little secret\nAfter');await page.locator('#message').evaluate(el=>{el.focus();el.setSelectionRange(9,15);document.dispatchEvent(new Event('selectionchange'))});await expect(page.locator('#rich-toolbar')).toBeVisible();await page.locator('#block-type-picker').click();await page.locator('#block-choice-h2').click();await expect(page.locator('#rich-editor h2')).toHaveText('A little secret');await expect(page.locator('#rich-editor>p')).toHaveText(['Before','After']);
});
test('list type changes actually produce numbered and task rows without changing sibling text',async({page})=>{
 await draft(page,'<ul><li>One</li><li>Two</li><li>Three</li></ul>');await menu(page,'#rich-editor li:nth-child(2)');await blockAction(page,'turn');await page.locator('#block-choice-number').click();await expect(page.locator('#rich-editor ol li')).toHaveText('Two');await expect(page.locator('#rich-editor ul li')).toHaveText(['One','Three']);
 await menu(page,'#rich-editor ol li');await blockAction(page,'turn');await page.locator('#block-choice-task').click();await expect(page.locator('#rich-editor li[data-checked=false]')).toHaveText('Two');await expect(page.locator('#rich-editor')).toHaveText('OneTwoThree');
});
test('empty blocks have localized visual placeholders that never enter copied content',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await draft(page,'<h2><br></h2><p><br></p><ul data-kind="task"><li data-checked="false"><br></li></ul><details open><summary><br></summary><p><br></p></details><aside data-kind="callout"><p><br></p></aside><table><tr><td><br></td></tr></table><p>Real content</p>');
 const pseudo=selector=>page.locator(selector).first().evaluate(el=>getComputedStyle(el,el.tagName==='LI'?'::after':'::before').content);
 await expect.poll(()=>pseudo('#rich-editor h2')).toBe('"Tiêu đề 2"');await expect.poll(()=>pseudo('#rich-editor>p')).toContain('Gõ /');await expect.poll(()=>pseudo('#rich-editor li')).toContain('việc cần làm');
 await page.locator('#language').selectOption('en');await expect.poll(()=>pseudo('#rich-editor>p')).toContain('Type /');await expect.poll(()=>pseudo('#rich-editor h2')).toBe('"Heading 2"');
 await page.locator('#copy-draft').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('Real content');const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).not.toMatch(/Type \/|Heading 2|To-do/);await caret(page,'#rich-editor h2');await page.keyboard.type('Written');expect(await pseudo('#rich-editor h2')).toBe('none');
 await page.screenshot({path:'test-results/basic-placeholders.png'});
});
test('deleting the last task exits the list, and slash aliases accept h2',async({page})=>{
 await draft(page,'<ul data-kind="task"><li data-checked="false">Delete this</li></ul><p>Keep this</p>');await menu(page,'#rich-editor li');await blockAction(page,'delete');await expect(page.locator('#rich-editor ul')).toHaveCount(0);await expect(page.locator('#rich-editor')).not.toContainText('Delete this');await expect(page.locator('#rich-editor')).toContainText('Keep this');
 await page.goto('/');await page.locator('#message').fill('/h2');await expect(page.locator('#block-choice-h2')).toBeVisible();await page.keyboard.press('Enter');await expect(page.locator('#rich-editor h2')).toBeVisible();
});
test('block keyboard shortcuts and exits keep typed content intact',async({page})=>{
 await page.goto('/');await page.locator('#message').fill('Heading shortcut');await expect(page.locator('#text-editor')).toHaveAttribute('data-enhanced','');await page.keyboard.press('ControlOrMeta+Alt+2');await expect(page.locator('#rich-editor h2')).toHaveText('Heading shortcut');
 await draft(page,'<ul data-kind="task"><li data-checked="false">Check me</li></ul>');await caret(page,'#rich-editor li');await page.keyboard.press('ControlOrMeta+Shift+Enter');await expect(page.locator('#rich-editor li')).toHaveAttribute('data-checked','true');
 await draft(page,'<pre>Code</pre>');await caret(page,'#rich-editor pre');await page.keyboard.press('Enter');await page.keyboard.type('Line two');await expect(page.locator('#rich-editor pre')).toContainText('Line two');await page.keyboard.press('Escape');await page.keyboard.type('Outside code');await expect(page.locator('#rich-editor>p')).toHaveText('Outside code');
 await draft(page,'<details open><summary>Toggle title</summary></details>');await caret(page,'#rich-editor summary');await page.keyboard.press('Enter');await page.keyboard.type('Toggle body');await expect(page.locator('#rich-editor details>p')).toHaveText('Toggle body');
});
test('clearing all rich content restores the main placeholder in the remaining empty paragraph',async({page})=>{
 await draft(page,'<p>Clear me</p>');await page.locator('#rich-editor').focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.press('Backspace');await expect.poll(()=>page.locator('#rich-editor').evaluate(el=>getComputedStyle(el.querySelector('p')||el,'::before').content)).toContain('Viết hoặc dán');await expect(page.locator('#rich-editor')).toHaveText('');
 await page.keyboard.type('New content');await expect.poll(()=>page.locator('#rich-editor').evaluate(el=>getComputedStyle(el.querySelector('p')||el,'::before').content)).toBe('none');
});
