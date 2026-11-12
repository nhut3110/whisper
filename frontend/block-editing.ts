// User-invoked block operations only. The browser owns text input and undo; no
// document model is reconciled or serialized on ordinary keystrokes.
type Options={rich:HTMLElement;plain:HTMLTextAreaElement;handle:HTMLElement;getBlock:()=>HTMLElement|null;prepare:()=>Promise<void>;openTypes:()=>void;t:(key:string)=>string}
export type BlockChoice={key:string;value?:string;html?:string}
export function editingActions({rich,plain,handle,getBlock,prepare,openTypes,t}:Options){
 const menu=document.getElementById('block-actions')!,tableMenu=document.getElementById('table-actions')!,tableButton=document.getElementById('table-tools')!,caretButton=document.getElementById('table-caret-tools')!
 let target:HTMLElement|null=null,cell:HTMLTableCellElement|null=null
 const selectionElement=()=>{const n=getSelection()?.anchorNode;return n instanceof HTMLElement?n:n?.parentElement}
 function editableBlock(){const element=selectionElement();return element&&rich.contains(element)?element.closest<HTMLElement>('li,details,aside,pre,blockquote,h1,h2,h3,p,div,table'):null}
 function path(node:Element){const indices:number[]=[];while(node!==rich&&node.parentElement){indices.unshift([...node.parentElement.children].indexOf(node));node=node.parentElement}return indices}
 function at(root:HTMLElement,indices:number[]){let node:Element=root;for(const index of indices)node=node.children[index];return node as HTMLElement}
 function focus(node:HTMLElement,end=true){rich.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(node);range.collapse(!end);const s=getSelection()!;s.removeAllRanges();s.addRange(range)}
 function commit(change:(clone:HTMLElement)=>HTMLElement|null){
  const clone=rich.cloneNode(true) as HTMLElement,result=change(clone);if(!clone.childNodes.length)clone.innerHTML='<p><br></p>'
  const indices=result?(()=>{const p:number[]=[];let n:Element=result;while(n!==clone&&n.parentElement){p.unshift([...n.parentElement.children].indexOf(n));n=n.parentElement}return p})():null
  rich.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(rich);const s=getSelection()!;s.removeAllRanges();s.addRange(range);document.execCommand('insertHTML',false,clone.innerHTML)
  // Chromium can retain the first list as the insertion container. Lift only
  // children that were top-level siblings in the intended transaction. Moving
  // those inserted nodes keeps the browser's undo references intact.
  const expected=clone.firstElementChild,actual=rich.firstElementChild
  if(expected?.matches('ul,ol')&&actual?.tagName===expected.tagName){let anchor=actual;for(const child of [...actual.children].slice(expected.children.length)){anchor.after(child);anchor=child}}
  if(indices){const node=at(rich,indices);if(node)focus(node)}else focus(rich)
  rich.dispatchEvent(new Event('input',{bubbles:true}))
 }
 function close(panel:HTMLElement){if(panel.matches(':popover-open'))panel.hidePopover();panel.hidden=true}
 function show(panel:HTMLElement,anchor:DOMRect){
  for(const other of [menu,tableMenu])close(other)
  panel.hidden=false;panel.showPopover();const rect=panel.getBoundingClientRect();panel.style.left=Math.max(12,Math.min(anchor.left,innerWidth-rect.width-12))+'px';panel.style.top=Math.max(65,Math.min(anchor.bottom+6,innerHeight-rect.height-12))+'px'
  panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true})
 }
 for(const panel of [menu,tableMenu]){
  panel.addEventListener('keydown',event=>{
   const buttons=[...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement)
   if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus()}
   if(event.key==='Escape'){event.preventDefault();close(panel);if(target?.isConnected)focus(target)}
  })
 }
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target as Node)&&!tableMenu.contains(event.target as Node)&&!handle.contains(event.target as Node)&&!tableButton.contains(event.target as Node)&&!caretButton.contains(event.target as Node)){close(menu);close(tableMenu)}})
 for(const event of ['scroll','resize'])window.addEventListener(event,()=>{close(menu);close(tableMenu)},{passive:true})
 function selectBlock(node:HTMLElement){rich.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(node);const s=getSelection()!;s.removeAllRanges();s.addRange(range)}
 async function openMenu(){await prepare();target=getBlock()||editableBlock()||rich.firstElementChild as HTMLElement;if(!target)return;show(menu,handle.getBoundingClientRect());for(const button of menu.querySelectorAll<HTMLButtonElement>('[data-block-action]')){const action=button.dataset.blockAction;button.disabled=action==='up'?!target.previousElementSibling:action==='down'?!target.nextElementSibling:false}}
 handle.addEventListener('click',()=>{if(!document.body.classList.contains('block-dragging'))void openMenu()})
 async function action(name:string){
  close(menu);if(!target?.isConnected)return
  if(name==='turn'){selectBlock(target);openTypes();return}
  if(name==='color'){selectBlock(target);document.querySelector<HTMLButtonElement>('[data-inline="color"]')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));document.querySelector<HTMLButtonElement>('[data-inline="color"]')?.click();return}
  if(name==='copy'){
   const copy=await new Promise<{clean:(html:string)=>string}>(resolve=>document.dispatchEvent(new CustomEvent('whisper:editor-clean',{detail:resolve})))
   const html=copy.clean(target.outerHTML),text=target.innerText
   try{if(typeof ClipboardItem!=='undefined')await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);else await navigator.clipboard.writeText(text);document.dispatchEvent(new CustomEvent('whisper:editor-notice',{detail:'copied'}))}catch{document.dispatchEvent(new CustomEvent('whisper:editor-notice',{detail:'copyFailed'}))}return
  }
  if(name==='delete'&&target.tagName==='LI'&&target.parentElement?.children.length===1){selectBlock(target);document.execCommand('delete');document.execCommand('outdent');document.execCommand('formatBlock',false,'p');rich.dispatchEvent(new Event('input',{bubbles:true}));return}
  const indices=path(target)
  commit(clone=>{const node=at(clone,indices);if(name==='duplicate'){const copy=node.cloneNode(true) as HTMLElement;node.after(copy);return copy}if(name==='delete'){const next=node.nextElementSibling||node.previousElementSibling,parent=node.parentElement!;node.remove();if(parent.matches('ul,ol')&&!parent.children.length){const p=document.createElement('p');p.append(document.createElement('br'));parent.replaceWith(p);return p}return next as HTMLElement|null}if(name==='up'&&node.previousElementSibling)node.previousElementSibling.before(node);if(name==='down'&&node.nextElementSibling)node.nextElementSibling.after(node);return node})
 }
 menu.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-block-action]');if(button)void action(button.dataset.blockAction!)})
 function convert(choice:BlockChoice){
  const element=selectionElement();if(!element||!rich.contains(element))return false
  let old=element.closest<HTMLElement>('li,summary,aside,pre,blockquote,h1,h2,h3,p,div,table')
  if(old===rich)old=rich.firstElementChild as HTMLElement
  if(old?.tagName==='SUMMARY')old=old.parentElement
  if(!old||!rich.contains(old))return false
  if(old.tagName==='LI'&&['bullet','number','task'].includes(choice.key)){
   const parent=old.parentElement!,desired=choice.key==='number'?'OL':'UL'
   if(parent.tagName!==desired){focus(old);document.execCommand(choice.key==='number'?'insertOrderedList':'insertUnorderedList');old=selectionElement()?.closest<HTMLElement>('li')||old}
   const indices=path(old)
   commit(clone=>{const li=at(clone,indices),list=li.parentElement!;if(choice.key==='task')li.dataset.checked='false';else li.removeAttribute('data-checked');if([...list.children].every(child=>child.hasAttribute('data-checked')))list.dataset.kind='task';else list.removeAttribute('data-kind');return li});return true
  }
  if(old.tagName==='LI'&&!['bullet','number','task'].includes(choice.key)){focus(old);document.execCommand('outdent');document.execCommand('formatBlock',false,'p');const current=selectionElement()?.closest<HTMLElement>('p');if(current&&rich.contains(current))old=current;else return false}
  if(old.tagName==='P'&&old.parentElement?.matches('aside,blockquote'))old=old.parentElement
  const indices=path(old)
  commit(clone=>{
   const node=at(clone,indices),holder=document.createElement('div'),list=['bullet','number','task'].includes(choice.key)
   let replacement:HTMLElement
   if(choice.html){holder.innerHTML=choice.html;replacement=holder.firstElementChild as HTMLElement}
   else replacement=document.createElement(list?choice.key==='number'?'ol':'ul':choice.value||'p')
   // Preserve inline formatting, nested content, and every row when changing a list.
   const content=document.createDocumentFragment()
   if(node.matches('ul,ol'))for(const li of [...node.children]){const p=document.createElement('p');p.append(...li.childNodes);content.append(p)}
   else if(node.matches('details')){const summary=node.querySelector('summary');if(summary)content.append(...summary.childNodes);for(const child of [...node.children])if(child!==summary)content.append(child)}
   else content.append(...node.childNodes)
   if(list){if(!replacement.matches('ul,ol'))replacement=document.createElement(choice.key==='number'?'ol':'ul');replacement.replaceChildren();if(choice.key==='task')replacement.dataset.kind='task';const rows=[...content.childNodes];const paragraphs=rows.length&&rows.every(n=>n instanceof Element&&n.matches('p'));for(const item of paragraphs?rows:[content]){const li=document.createElement('li');if(choice.key==='task')li.dataset.checked='false';if(item instanceof Element&&item.matches('p'))li.append(...item.childNodes);else li.append(item);replacement.append(li)}}
   else if(choice.key==='toggle'){const summary=replacement.querySelector('summary')!;summary.replaceChildren(content);replacement.setAttribute('open','')}
   else if(choice.key==='callout')replacement.querySelector('p')!.replaceChildren(content)
   else if(choice.key==='table')replacement.querySelector('th')!.replaceChildren(content)
   else if(choice.key==='divider'){node.before(replacement);return node}
   else if(choice.key==='code'){replacement.textContent=content.textContent}
   else replacement.append(content)
   if(node.matches('li')){const parent=node.parentElement!;if(list){node.replaceWith(...replacement.childNodes);if(choice.key==='task'){parent.dataset.kind='task';for(const li of parent.children)(li as HTMLElement).dataset.checked||='false'}else{parent.removeAttribute('data-kind');for(const li of parent.children)li.removeAttribute('data-checked')}return parent}const before=parent.cloneNode(false) as HTMLElement,after=parent.cloneNode(false) as HTMLElement;let passed=false;for(const li of [...parent.children]){if(li===node){passed=true;continue}(passed?after:before).append(li)}parent.replaceWith(...(before.childNodes.length?[before]:[]),replacement,...(after.childNodes.length?[after]:[]));return replacement}
   node.replaceWith(replacement);return replacement
  });return true
 }
 function tableAction(name:string){
  close(tableMenu);if(!cell?.isConnected)return
  const table=cell.closest('table')!,indices=path(table),r=(cell.parentElement as HTMLTableRowElement).rowIndex,c=cell.cellIndex
  commit(clone=>{
   const copy=at(clone,indices) as HTMLTableElement,row=copy.rows[r]
   const empty=(tag:string)=>{const el=document.createElement(tag);el.append(document.createElement('br'));return el}
   if(name==='deleteTable'){const p=document.createElement('p');p.append(document.createElement('br'));copy.replaceWith(p);return p}
   if(name==='rowAbove'||name==='rowBelow'){const next=document.createElement('tr');for(const item of row.cells)next.append(empty(item.tagName.toLowerCase()));name==='rowAbove'?row.before(next):row.after(next);return next.cells[c]}
   if(name==='columnLeft'||name==='columnRight'){for(const line of copy.rows){const anchor=line.cells[c],next=empty(anchor.tagName.toLowerCase());name==='columnLeft'?anchor.before(next):anchor.after(next)}return copy.rows[r].cells[c+(name==='columnRight'?1:0)]}
   if(name==='deleteRow'){if(copy.rows.length===1){copy.innerHTML='<tbody><tr><td><br></td></tr></tbody>'}else row.remove();return copy.rows[Math.min(r,copy.rows.length-1)].cells[0]}
   if(name==='deleteColumn'){if(row.cells.length===1){copy.innerHTML='<tbody><tr><td><br></td></tr></tbody>'}else for(const line of copy.rows)line.cells[c].remove();return copy.rows[Math.min(r,copy.rows.length-1)].cells[Math.min(c,copy.rows[0].cells.length-1)]}
   if(name==='headerRow'||name==='headerColumn'){const cells=name==='headerRow'?[...copy.rows[0].cells]:[...copy.rows].map(row=>row.cells[0]),header=!cells.every(item=>item.tagName==='TH');for(const item of cells){const replacement=document.createElement(header?'th':'td');replacement.append(...item.childNodes);item.replaceWith(replacement)}}
   if(name==='clearCell')row.cells[c].replaceChildren(document.createElement('br'))
   return copy.rows[r]?.cells[c]||copy
  })
 }
 for(const button of [tableButton,caretButton]){button.addEventListener('pointerdown',e=>{e.preventDefault();cell=selectionElement()?.closest('td,th') as HTMLTableCellElement|null});button.addEventListener('click',()=>{if(cell){show(tableMenu,button.getBoundingClientRect());target=cell.closest('table')}})}
 tableMenu.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-table-action]');if(button)tableAction(button.dataset.tableAction!)})
 let syncFrame=0
 function sync(){syncFrame=0;const element=selectionElement(),table=element&&rich.contains(element)?element.closest('table'):null;const active=plain.hidden&&table&&document.activeElement===rich;tableButton.hidden=!active;caretButton.hidden=!active||!getSelection()?.isCollapsed;if(!caretButton.hidden){const rect=table!.getBoundingClientRect();caretButton.style.left=Math.max(12,Math.min(rect.right-27,innerWidth-40))+'px';caretButton.style.top=Math.max(66,Math.min(rect.top-30,innerHeight-40))+'px'}}
 document.addEventListener('selectionchange',()=>{if(!syncFrame)syncFrame=requestAnimationFrame(sync)})
 for(const event of ['scroll','resize'])window.addEventListener(event,()=>{caretButton.hidden=true},{passive:true})
 rich.addEventListener('keydown',event=>{
  if(event.isComposing)return
  const el=selectionElement(),li=el?.closest('li'),s=getSelection(),collapsed=s?.isCollapsed
  if(event.key==='Tab'&&li&&!el?.closest('td,th')){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent');rich.dispatchEvent(new Event('input',{bubbles:true}));return}
  if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='d'){event.preventDefault();target=editableBlock();void action('duplicate');return}
  if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key==='Enter'&&li?.hasAttribute('data-checked')){event.preventDefault();const indices=path(li);commit(clone=>{const node=at(clone,indices);node.dataset.checked=String(node.dataset.checked!=='true');return node});return}
  if(event.key==='Enter'&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey&&collapsed){
   if(li&&!li.textContent?.trim()){event.preventDefault();focus(li);document.execCommand('outdent');document.execCommand('formatBlock',false,'p');rich.dispatchEvent(new Event('input',{bubbles:true}));return}
   if(li&&!li.querySelector('ul,ol')){const prefix=s!.getRangeAt(0).cloneRange();prefix.selectNodeContents(li);prefix.setEnd(s!.anchorNode!,s!.anchorOffset);if(prefix.toString()===li.textContent){event.preventDefault();const indices=path(li);commit(clone=>{const node=at(clone,indices),next=document.createElement('li');next.append(document.createElement('br'));if(node.hasAttribute('data-checked'))next.dataset.checked='false';node.after(next);return next});return}}
   if(el?.closest('summary')){event.preventDefault();const summary=el.closest('summary')!,details=summary.parentElement!,indices=path(details);commit(clone=>{const node=at(clone,indices);node.setAttribute('open','');let content=node.querySelector<HTMLElement>(':scope>p');if(!content){content=document.createElement('p');content.append(document.createElement('br'));node.querySelector('summary')!.after(content)}return content});return}
   if(el?.closest('pre')){event.preventDefault();document.execCommand('insertText',false,'\n');return}
  }
  if(event.key==='Escape'&&el?.closest('pre,details,aside,blockquote')){event.preventDefault();const block=el.closest<HTMLElement>('pre,details,aside,blockquote')!,p=document.createElement('p');p.append(document.createElement('br'));block.after(p);focus(p,false);rich.dispatchEvent(new Event('input',{bubbles:true}))}
 })
 function nextCell(backwards:boolean){
  const current=selectionElement()?.closest('td,th') as HTMLTableCellElement|null;if(!current)return
  const table=current.closest('table')!,cells=[...table.querySelectorAll<HTMLElement>('td,th')],next=cells[cells.indexOf(current)+(backwards?-1:1)]
  if(next){focus(next,false);return}if(backwards)return
  const indices=path(table),columns=(current.parentElement as HTMLTableRowElement).cells.length
  commit(clone=>{const copy=at(clone,indices) as HTMLTableElement,row=copy.insertRow();for(let i=0;i<columns;i++)row.insertCell().append(document.createElement('br'));return row.cells[0]})
 }
 function toggleTask(li:HTMLElement){const indices=path(li);commit(clone=>{const node=at(clone,indices);node.dataset.checked=String(node.dataset.checked!=='true');return node})}
 return {convert,openMenu,nextCell,toggleTask}
}
