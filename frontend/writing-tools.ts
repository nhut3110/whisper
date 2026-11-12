import {editingActions} from './block-editing'
type Options={plain:HTMLTextAreaElement;rich:HTMLElement;editor:HTMLElement;toolbar:HTMLElement;t:(key:string)=>string;enableRich:(start?:number,end?:number)=>Promise<boolean>;openTypes:()=>void}
const palette:Record<string,string>={default:'',gray:'#787774',brown:'#9f6b53',orange:'#d9730d',yellow:'#cb912f',green:'#448361',blue:'#337ea9',purple:'#9065b0',pink:'#c14c8a',red:'#d44c47'}
export function blockTools({plain,rich,editor,toolbar,t,enableRich,openTypes}:Options){
 const gutter=document.getElementById('block-gutter')!,drag=document.getElementById('move-block')!,type=document.getElementById('block-type-picker')!,linkPanel=document.getElementById('link-editor')!,colorPanel=document.getElementById('color-picker')!
 let selected:Range|null=null,plainSelection:{start:number;end:number}|null=null,block:HTMLElement|null=null,line=0,mouseFrame=0,hovering=false
 for(const name of ['scroll','resize'])window.addEventListener(name,()=>{gutter.removeAttribute('data-visible');mirrorKey='';hovering=false},{passive:true})
 const mirror=document.createElement('div');mirror.className='writing-mirror';mirror.setAttribute('aria-hidden','true');document.body.append(mirror)
 let mirrorKey='',mirrorRect=new DOMRect()
 function plainRect(offset:number){
  const key=plain.value+'|'+offset+'|'+plain.clientWidth+'|'+plain.scrollTop
  if(key===mirrorKey)return mirrorRect
  mirrorKey=key;const style=getComputedStyle(plain),rect=plain.getBoundingClientRect()
  for(const name of ['font','lineHeight','letterSpacing','padding','border','boxSizing','wordBreak','overflowWrap','textAlign','direction'] as const)mirror.style[name]=style[name]
  mirror.style.width=rect.width+'px';mirror.style.whiteSpace='pre-wrap';mirror.style.left=rect.left+'px';mirror.style.top=(rect.top-plain.scrollTop)+'px'
  mirror.textContent=plain.value.slice(0,offset);const span=document.createElement('span');span.textContent=plain.value.slice(offset,offset+1)||'\u200b';mirror.append(span);mirrorRect=span.getBoundingClientRect();return mirrorRect
 }
 function rootBlock(node:Node|null){const n=node instanceof HTMLElement?node:node?.parentElement;const li=n?.closest<HTMLElement>('li');if(li&&rich.contains(li))return li;let element=node instanceof HTMLElement?node:node?.parentElement;while(element&&element.parentElement!==rich)element=element.parentElement;return element&&element!==rich?element:null}
 function setGutter(rect:DOMRect){
  const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<=600
  const x=(plain.hidden?(block||rich):plain).getBoundingClientRect().left
  const height=Number.parseFloat(getComputedStyle(block||plain).lineHeight)||28
  gutter.style.left=Math.max(4,x-(mobile?40:58))+'px';gutter.style.top=(rect.top+Math.min(rect.height||height,height)/2-13)+'px';gutter.dataset.visible=''
 }
 function updateGutter(source:HTMLElement,rect:DOMRect){
  if(hovering)return
  if(source===plain){block=null;line=plain.value.slice(0,plain.selectionStart).split('\n').length-1;setGutter(rect)}
  else{block=rootBlock(getSelection()?.anchorNode||null);if(block)setGutter(block.getBoundingClientRect());else setGutter(rect)}
 }
 editor.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'||mouseFrame)return
  const target=event.target as Node
  mouseFrame=requestAnimationFrame(()=>{mouseFrame=0;if(!plain.hidden)return;const next=rootBlock(target);if(next){block=next;hovering=true;setGutter(next.getBoundingClientRect())}})
 })
 editor.addEventListener('pointerleave',()=>{hovering=false})
 rich.addEventListener('input',()=>{hovering=false})
 function selection(){return selected?.cloneRange()||null}
 function capture(){
  if(!plain.hidden){plainSelection={start:plain.selectionStart,end:plain.selectionEnd};selected=null}
  else{const s=getSelection();if(s?.rangeCount&&rich.contains(s.anchorNode)){selected=s.getRangeAt(0).cloneRange();plainSelection=null}}
  for(const button of toolbar.querySelectorAll<HTMLElement>('[data-command]')){const on=document.queryCommandState(button.dataset.command!);button.setAttribute('aria-pressed',String(on))}
  const node=getSelection()?.anchorNode,element=node instanceof Element?node:node?.parentElement
  const tag=element?.closest('h1,h2,h3,pre,blockquote,li')?.tagName.toLowerCase()
  const key=tag==='li'?'blockBullet':tag==='pre'?'blockCode':tag==='blockquote'?'blockQuote':tag?'block'+tag.toUpperCase():'blockText'
  document.getElementById('current-block-label')!.textContent=t(key)
 }
 async function restore(){
  if(plainSelection){if(!await enableRich(plainSelection.start,plainSelection.end))return false;plainSelection=null;const s=getSelection();selected=s?.rangeCount?s.getRangeAt(0).cloneRange():null}
  rich.focus({preventScroll:true});if(selected&&rich.contains(selected.commonAncestorContainer)){const s=getSelection()!;s.removeAllRanges();s.addRange(selected)}return true
 }
 function focusBlock(){if(block?.isConnected){rich.focus();const r=document.createRange();r.selectNodeContents(block);r.collapse(false);const s=getSelection()!;s.removeAllRanges();s.addRange(r)}}
 function insertAfter(){
  if(block?.isConnected){const p=document.createElement(block.tagName==='LI'?'li':'p');if(block.hasAttribute('data-checked'))p.dataset.checked='false';p.append(document.createElement('br'));block.after(p);const r=document.createRange();r.selectNodeContents(p);r.collapse(true);const s=getSelection()!;s.removeAllRanges();s.addRange(r)}else document.execCommand('insertParagraph')
 }
 for(const panel of [linkPanel,colorPanel]){
  panel.addEventListener('toggle',()=>{if(!panel.matches(':popover-open'))panel.hidden=true})
 }
 function showPanel(panel:HTMLElement){
  const anchor=toolbar.offsetHeight?toolbar.getBoundingClientRect():selected?.getBoundingClientRect()||rich.getBoundingClientRect();panel.hidden=false;panel.showPopover();const rect=panel.getBoundingClientRect();panel.style.left=Math.max(12,Math.min(anchor.left,innerWidth-rect.width-12))+'px';panel.style.top=Math.max(12,Math.min(anchor.bottom+8,innerHeight-rect.height-12))+'px'
 }
 type.addEventListener('pointerdown',e=>e.preventDefault());type.addEventListener('click',()=>{capture();openTypes()})
 for(const button of toolbar.querySelectorAll<HTMLElement>('[data-inline]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();capture()})
  button.addEventListener('click',async()=>{
   const action=button.dataset.inline
   if(action==='link'){showPanel(linkPanel);const input=document.getElementById('editor-link') as HTMLInputElement;const node=selected?.startContainer;const anchor=(node instanceof Element?node:node?.parentElement)?.closest('a');input.value=anchor?.getAttribute('href')||'';document.getElementById('editor-link-error')!.hidden=true;input.focus();return}
   if(action==='color'){showPanel(colorPanel);return}
   if(action==='code'&&await restore()){
    const s=getSelection()!,r=s.getRangeAt(0),node=r.commonAncestorContainer,code=(node instanceof Element?node:node.parentElement)?.closest('code')
    if(code){const range=document.createRange();range.selectNode(code);s.removeAllRanges();s.addRange(range);const text=document.createElement('span');text.textContent=code.textContent;document.execCommand('insertHTML',false,text.innerHTML)}
    else{const el=document.createElement('code');el.textContent=s.toString();document.execCommand('insertHTML',false,el.outerHTML)}
    rich.dispatchEvent(new Event('input',{bubbles:true}))
   }
  })
 }
 document.getElementById('link-form')!.addEventListener('submit',async event=>{
  event.preventDefault();const value=(document.getElementById('editor-link') as HTMLInputElement).value.trim();let valid=false;try{valid=new URL(value).protocol==='https:'}catch{}
  if(!valid){document.getElementById('editor-link-error')!.hidden=false;return}
  linkPanel.hidePopover();linkPanel.hidden=true;if(await restore()){document.execCommand('createLink',false,value);rich.dispatchEvent(new Event('input',{bubbles:true}))}
 })
 document.getElementById('remove-editor-link')!.addEventListener('click',async()=>{linkPanel.hidePopover();linkPanel.hidden=true;if(await restore()){document.execCommand('unlink');rich.dispatchEvent(new Event('input',{bubbles:true}))}})
 colorPanel.addEventListener('pointerdown',e=>e.preventDefault())
 colorPanel.addEventListener('click',async event=>{
  const button=(event.target as Element).closest<HTMLElement>('[data-ink],[data-highlight]');if(!button)return
  const background=button.hasAttribute('data-highlight'),color=button.getAttribute(background?'data-highlight':'data-ink')!
  colorPanel.hidePopover();colorPanel.hidden=true;if(!await restore())return
  if(color==='default')document.execCommand('removeFormat')
  else if(background)document.execCommand('hiliteColor',false,palette[color])
  else document.execCommand('foreColor',false,palette[color])
  rich.dispatchEvent(new Event('input',{bubbles:true}))
 })
 document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const panel of [linkPanel,colorPanel])if(panel.matches(':popover-open')){panel.hidePopover();panel.hidden=true;void restore()}})
 function normalizeLines(){
  if([...rich.children].some(el=>el.matches('p,div,h1,h2,h3,ul,ol,pre,blockquote,table,details,aside')))return
  const fragment=document.createDocumentFragment();let p=document.createElement('p');fragment.append(p)
  for(const node of [...rich.childNodes]){if(node.nodeName==='BR'){if(!p.childNodes.length)p.append(document.createElement('br'));p=document.createElement('p');fragment.append(p)}else p.append(node)}
  if(!p.childNodes.length)p.append(document.createElement('br'));rich.replaceChildren(fragment)
 }
 // Pointer capture makes the same block move gesture work for mouse, pen and touch.
 let moving:HTMLElement|null=null,destination:HTMLElement|null=null,after=false,startY=0,pointer=-1,dragging=false
 const indicator=document.createElement('div');indicator.id='block-drop-line';indicator.hidden=true;document.body.append(indicator)
 drag.addEventListener('pointerdown',async event=>{
  if(event.button!==0)return;event.preventDefault();startY=event.clientY;pointer=event.pointerId;drag.setPointerCapture(pointer)
  if(!plain.hidden){const current=line;if(!await enableRich(plain.selectionStart,plain.selectionStart))return;normalizeLines();block=rich.children[Math.min(current,rich.children.length-1)] as HTMLElement}
  if(pointer!==event.pointerId)return;moving=block;dragging=false;destination=null
 })
 drag.addEventListener('pointermove',event=>{
  if(pointer!==event.pointerId||!moving)return
  if(Math.abs(event.clientY-startY)<5&&!dragging)return;dragging=true;document.body.classList.add('block-dragging');moving.classList.add('moving-block')
  const candidates=[...(moving.parentElement||rich).children].filter(el=>el!==moving) as HTMLElement[]
  destination=candidates.find(el=>event.clientY<el.getBoundingClientRect().bottom)||candidates.at(-1)||null
  if(!destination)return;const rect=destination.getBoundingClientRect();after=event.clientY>rect.top+rect.height/2
  indicator.hidden=false;indicator.style.left=rect.left+'px';indicator.style.top=(after?rect.bottom:rect.top)+'px';indicator.style.width=rect.width+'px'
  if(event.clientY>innerHeight-55)window.scrollBy(0,18);else if(event.clientY<90)window.scrollBy(0,-18)
 })
 function finish(commit:boolean){
  if(commit&&dragging&&moving&&destination){
   moving.classList.remove('moving-block')
   const clone=rich.cloneNode(true) as HTMLElement
   const address=(node:Element)=>{const indices:number[]=[];while(node!==rich&&node.parentElement){indices.unshift([...node.parentElement.children].indexOf(node));node=node.parentElement}return indices}
   const locate=(indices:number[])=>indices.reduce<Element>((node,index)=>node.children[index],clone)
   const source=locate(address(moving)),target=locate(address(destination))
   if(after)target.after(source);else target.before(source)
   rich.focus();const range=document.createRange();range.selectNodeContents(rich);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);document.execCommand('insertHTML',false,clone.innerHTML.replaceAll(' class="moving-block"',''));rich.dispatchEvent(new Event('input',{bubbles:true}))
  }
  moving?.classList.remove('moving-block');document.body.classList.remove('block-dragging');indicator.hidden=true;moving=destination=null;pointer=-1;dragging=false
 }
 let ignoreClick=false
 drag.addEventListener('click',event=>{if(ignoreClick){event.stopImmediatePropagation();event.preventDefault();ignoreClick=false}})
 drag.addEventListener('pointerup',()=>{ignoreClick=dragging;finish(true)});drag.addEventListener('pointercancel',()=>finish(false));drag.addEventListener('lostpointercapture',()=>{if(pointer!==-1)finish(false)})
 drag.addEventListener('keydown',event=>{
  if(!['ArrowUp','ArrowDown'].includes(event.key)||!block)return;event.preventDefault();moving=block;destination=(event.key==='ArrowUp'?block.previousElementSibling:block.nextElementSibling) as HTMLElement;after=event.key==='ArrowDown';dragging=true;finish(true)
 })
 rich.addEventListener('click',event=>{const li=(event.target as Element).closest<HTMLElement>('li[data-checked]');if(li&&event.clientX<li.getBoundingClientRect().left+22)actions.toggleTask(li)})
 const actions=editingActions({rich,plain,handle:drag,getBlock:()=>block,prepare:async()=>{if(!plain.hidden){const current=line;await enableRich(plain.selectionStart,plain.selectionEnd);normalizeLines();block=rich.children[Math.min(current,rich.children.length-1)] as HTMLElement}},openTypes(){capture();openTypes()},t})
 return {plainRect,updateGutter,capture,selection,focusBlock,insertAfter,normalizeLines,nextCell:actions.nextCell,convert:actions.convert}
}
