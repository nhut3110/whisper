// Optional, DOM-owned writing tools. No React reconciliation per keystroke.
import {blockShortcutKeys,shortcutLabel,shortcutTarget,installShortcutHints} from './editor-shortcuts'
import { blockTools } from './writing-tools'
import {installSpoilerEditor} from './spoiler-editor'
type Command = {key:string;icon:string;label:string;command:string;value?:string;search:string;html?:string;description?:string}
const commands:Command[] = [
 {key:'text',icon:'T',label:'blockText',command:'formatBlock',value:'p',search:'text paragraph văn bản'},
 {key:'h1',icon:'H₁',label:'blockH1',command:'formatBlock',value:'h1',search:'heading title tiêu đề'},
 {key:'h2',icon:'H₂',label:'blockH2',command:'formatBlock',value:'h2',search:'heading subtitle tiêu đề'},
 {key:'h3',icon:'H₃',label:'blockH3',command:'formatBlock',value:'h3',search:'heading tiêu đề'},
 {key:'bullet',icon:'≡',label:'blockBullet',command:'insertUnorderedList',search:'bullet list danh sách'},
 {key:'number',icon:'1.',label:'blockNumber',command:'insertOrderedList',search:'number list danh sách số'},
 {key:'quote',icon:'“',label:'blockQuote',command:'formatBlock',value:'blockquote',search:'quote trích dẫn'},
 {key:'code',icon:'</>',label:'blockCode',command:'formatBlock',value:'pre',search:'code mã'},
 {key:'task',icon:'☑',label:'blockTask',command:'insertHTML',html:'<ul data-kind="task"><li data-checked="false"><br></li></ul>',search:'todo checklist task việc cần làm'},
 {key:'toggle',icon:'▸',label:'blockToggle',command:'insertHTML',html:'<details open><summary><br></summary><p><br></p></details>',search:'toggle collapse thu gọn'},
 {key:'callout',icon:'!',label:'blockCallout',command:'insertHTML',html:'<aside data-kind="callout"><p><br></p></aside>',search:'callout note ghi chú'},
 {key:'divider',icon:'—',label:'blockDivider',command:'insertHTML',html:'<hr><p><br></p>',search:'divider rule ngăn cách'},
 {key:'table',icon:'▦',label:'blockTable',command:'insertHTML',html:'<table><tbody><tr><th><br></th><th><br></th></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>',search:'table bảng'},

]
let installed=false
export async function install(){
 if(installed)return;installed=true
 const {t}=await new Promise<{t:(key:string)=>string}>(resolve=>document.dispatchEvent(new CustomEvent('whisper:editor-translate',{detail:resolve})))
 const plain=document.getElementById('message') as HTMLTextAreaElement
 const rich=document.getElementById('rich-editor')!
 installSpoilerEditor(rich)
 const toolbar=document.getElementById('rich-toolbar')!
 installShortcutHints(toolbar)
 const editor=document.getElementById('text-editor')!
 const popup=document.createElement('div');popup.id='block-picker';popup.className='block-picker';popup.hidden=true;popup.setAttribute('role','listbox');popup.setAttribute('aria-label',t('blockMenu'));document.body.append(popup)
 editor.dataset.enhanced=''
 let convert=false,entries=commands,index=0,slashRange:Range|null=null,plainStart=0,source:HTMLElement=plain,frame=0,composing=false,locked=false,suppressed=false
 function hide(){popup.hidden=true;source.removeAttribute('aria-activedescendant');source.removeAttribute('aria-controls');source.removeAttribute('aria-expanded');}
 function place(element:HTMLElement,rect:DOMRect){
  const width=element===popup?Math.min(292,innerWidth-24):Math.min(element.scrollWidth||410,innerWidth-24)
  const height=element.offsetHeight
  const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,vw=viewport?.width||innerWidth,vh=viewport?.height||innerHeight
  element.style.width=width+'px';element.style.left=Math.max(left+12,Math.min(element===toolbar?rect.left+rect.width/2-width/2:rect.left,left+vw-width-12))+'px'
  const preferred=element===toolbar&&rect.top-height-10>top+60?rect.top-height-10:rect.bottom+8
  element.style.top=Math.max(top+12,Math.min(preferred,top+vh-height-12))+'px'
 }
 function caretRect(){
  const sel=getSelection();if(source===rich&&sel?.rangeCount){const rect=sel.getRangeAt(0).getBoundingClientRect();if(rect.height)return rect;const range=document.createRange();range.selectNodeContents(rich);const first=[...range.getClientRects()].find(r=>r.height);return first||rich.getBoundingClientRect()}
  return tools.plainRect(plain.selectionStart)
 }
 function render(query:string){
  entries=commands.filter(item=>(item.key+' '+t(item.label)+' '+item.search).toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  if(!entries.length){hide();return}
  index=Math.min(index,entries.length-1);popup.replaceChildren()
  for(const [i,item] of entries.entries()){
   const button=document.createElement('button');button.type='button';button.id='block-choice-'+item.key;button.setAttribute('role','option');button.setAttribute('aria-selected',String(i===index));button.tabIndex=-1
   const icon=document.createElement('span');icon.className='block-symbol';icon.textContent=item.icon
   const label=document.createElement('span');label.className='block-choice-label';const name=document.createElement('span');name.textContent=t(item.label);const hint=document.createElement('small');hint.textContent=t(item.label+'Hint');label.append(name,hint);button.append(icon,label);button.title=t(item.label);const digit=blockShortcutKeys.indexOf(item.key);if(digit>=0){const shortcut=document.createElement('kbd');shortcut.className='block-choice-shortcut';shortcut.textContent=shortcutLabel(String(digit),{alt:true});button.title+=' · '+shortcut.textContent;button.append(shortcut);button.setAttribute('aria-keyshortcuts',`${/Mac|iPhone|iPad/.test(navigator.platform)?'Meta':'Control'}+Alt+${digit}`)}button.addEventListener('pointerdown',e=>e.preventDefault());button.addEventListener('click',()=>void choose(item));popup.append(button)
  }
  document.dispatchEvent(new Event('whisper:editor-prepare'))
  popup.hidden=false;source.setAttribute('aria-controls',popup.id);source.setAttribute('aria-expanded','true');source.setAttribute('aria-activedescendant','block-choice-'+entries[index].key);place(popup,caretRect())
 }
 function enableRich(start?:number,end?:number):Promise<boolean>{return new Promise(resolve=>document.dispatchEvent(new CustomEvent('whisper:editor-enable',{detail:{start,end,resolve}})))}
 async function choose(item:Command){
  if(locked)return;locked=true
  const wasPlain=source===plain,originalText=plain.value,caret=plain.selectionStart,start=plainStart,saved=convert?tools.selection():slashRange?.cloneRange(),changingType=convert;convert=false
  hide();toolbar.removeAttribute('data-open')
  try{
   if(wasPlain){if(!await enableRich(changingType?undefined:start,changingType?undefined:caret))return;if(changingType){tools.normalizeLines();const block=rich.children[Math.min(plain.value.slice(0,caret).split('\n').length-1,rich.children.length-1)];if(block){const range=document.createRange();range.selectNodeContents(block);const s=getSelection()!;s.removeAllRanges();s.addRange(range)}}}
   else{rich.focus();if(saved){const selection=getSelection()!;selection.removeAllRanges();selection.addRange(saved)}}
   if(changingType&&tools.convert(item))return
   if(!changingType&&((wasPlain&&caret>start)||(!wasPlain&&saved&&!saved.collapsed)))document.execCommand('insertText',false,'')
   // Chromium reports formatBlock success on a truly empty root without creating
   // a block. Seed one editable paragraph so the caret retains the chosen type.
   if(!rich.textContent&& !rich.firstElementChild){
    document.execCommand('insertHTML',false,'<p><br></p>')
    const range=document.createRange();range.selectNodeContents(rich.firstElementChild!);range.collapse(true);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range)
   }
   if(item.html){
    const selection=getSelection()!,range=selection.getRangeAt(0),fragment=range.cloneContents(),text=changingType?fragment.textContent||'':''
    const holder=document.createElement('div');holder.innerHTML=item.html
    if(text){const target=holder.querySelector('li,summary,p,th');if(target)target.textContent=text}
    document.execCommand('insertHTML',false,holder.innerHTML)
    const target=rich.querySelector(item.key==='task'?'li[data-checked]':item.key==='toggle'?'details:last-of-type summary':item.key==='table'?'table:last-of-type th':item.key==='callout'?'aside:last-of-type p':'p:last-child')
    if(target){const caretRange=document.createRange();caretRange.selectNodeContents(target);caretRange.collapse(false);selection.removeAllRanges();selection.addRange(caretRange)}
   }else document.execCommand(item.command,false,item.value)

   if(wasPlain&&plain.value!==originalText){
    const selection=getSelection()!,anchor=selection.anchorNode,element=anchor instanceof Element?anchor:anchor?.parentElement
    const block=element?.closest('p,div,li,h1,h2,h3,blockquote,pre')
    if(block&&rich.contains(block)){const range=document.createRange();range.selectNodeContents(block);range.collapse(false);selection.removeAllRanges();selection.addRange(range)}
   }
   rich.dispatchEvent(new Event('input',{bubbles:true}))
  }finally{locked=false}
 }
 function update(){
  frame=0;if(composing||locked)return
  const active=document.activeElement
  if(active!==plain&&active!==rich){if(!toolbar.contains(active)&&!popup.contains(active)){hide();toolbar.removeAttribute('data-open')}return}
  if(editor.closest('[hidden]')){hide();toolbar.removeAttribute('data-open');return}
  source=active as HTMLElement
  const selection=getSelection()
  let text='',start=0,selected=false,rect:DOMRect|null=null
  if(source===plain){start=plain.value.lastIndexOf('\n',plain.selectionStart-1)+1;text=plain.value.slice(start,plain.selectionStart);plainStart=start;selected=plain.selectionStart!==plain.selectionEnd;rect=tools.plainRect(plain.selectionStart)}
  else if(selection?.rangeCount&&rich.contains(selection.anchorNode)){
   const range=selection.getRangeAt(0);selected=!range.collapsed;rect=range.getBoundingClientRect();let block:Node=range.startContainer
   while(block.parentNode&&block.parentNode!==rich&&!/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test((block as Element).tagName||''))block=block.parentNode
   const prefix=range.cloneRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);text=prefix.toString();slashRange=prefix
  }
  tools.updateGutter(source,caretRect())
  if(convert&&!popup.hidden)return
  if(!suppressed&&!selected&&/^\/[^\n/]{0,32}$/.test(text)){render(text.slice(1));toolbar.removeAttribute('data-open')}
  else{hide();if(selected&&rect){document.dispatchEvent(new Event('whisper:editor-prepare'));toolbar.hidden=false;toolbar.dataset.open='';place(toolbar,rect);tools.capture()}else toolbar.removeAttribute('data-open')}
 }
 const tools=blockTools({plain,rich,editor,toolbar,t,enableRich,openTypes(){source=plain.hidden?rich:plain;convert=true;slashRange=null;render('')}})
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)}
 document.addEventListener('selectionchange',schedule)
 for(const surface of [plain,rich]){
  surface.addEventListener('input',()=>{suppressed=false;schedule()});surface.addEventListener('pointerup',schedule);surface.addEventListener('keyup',schedule)
  surface.addEventListener('compositionstart',()=>{composing=true;hide()});surface.addEventListener('compositionend',()=>{composing=false;schedule()})
  surface.addEventListener('keydown',event=>{
   if(event.isComposing||composing)return
   if(event.defaultPrevented)return
   const selector=shortcutTarget(event);if(selector){event.preventDefault();tools.capture();const button=toolbar.querySelector<HTMLButtonElement>(selector)!;button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));button.click();return}
   if((event.metaKey||event.ctrlKey)&&event.altKey&&/^Digit[0-9]$/.test(event.code)){const key=blockShortcutKeys[Number(event.code.slice(5))];event.preventDefault();source=surface;convert=true;tools.capture();void choose(commands.find(item=>item.key===key)!);return}
   const anchor=getSelection()?.anchorNode,anchorElement=anchor instanceof Element?anchor:anchor?.parentElement
   if(event.key==='Tab'&&popup.hidden&&surface===rich&&anchorElement?.closest('td,th')){event.preventDefault();tools.nextCell(event.shiftKey);return}
   if(!popup.hidden){
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();index=event.key==='Home'?0:event.key==='End'?entries.length-1:(index+(event.key==='ArrowDown'?1:-1)+entries.length)%entries.length;const query=source===plain?plain.value.slice(plainStart+1,plain.selectionStart):slashRange?.toString().slice(1)||'';render(query);popup.children[index]?.scrollIntoView({block:'nearest'});return}
    if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();void choose(entries[index]);return}
    if(event.key==='Escape'){event.preventDefault();suppressed=true;hide();return}
   }
   if(event.key===' '&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    source=surface;let prefix=''
    if(surface===plain){plainStart=plain.value.lastIndexOf('\n',plain.selectionStart-1)+1;prefix=plain.value.slice(plainStart,plain.selectionStart)}
    else{const selection=getSelection();if(selection?.rangeCount&&selection.isCollapsed){const range=selection.getRangeAt(0).cloneRange();let block:Node=range.startContainer;while(block.parentNode&&block.parentNode!==rich&&!/^(P|DIV|LI|H[1-6])$/.test((block as Element).tagName||''))block=block.parentNode;range.selectNodeContents(block);range.setEnd(selection.anchorNode!,selection.anchorOffset);prefix=range.toString();slashRange=range}}
    const key=({'#':'h1','##':'h2','###':'h3','-':'bullet','*':'bullet','1.':'number','>':'quote','```':'code','[]':'task','[ ]':'task','[x]':'task','---':'divider'} as Record<string,string>)[prefix]
    if(key){event.preventDefault();void choose(commands.find(item=>item.key===key)!)}
   }
  })
 }
 document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target as Node)&&!editor.contains(event.target as Node)){hide();toolbar.removeAttribute('data-open')}})
 window.addEventListener('scroll',()=>{hide();toolbar.removeAttribute('data-open')},{passive:true})
 window.addEventListener('resize',()=>{hide();toolbar.removeAttribute('data-open')},{passive:true})
 window.visualViewport?.addEventListener('resize',()=>{hide();toolbar.removeAttribute('data-open')},{passive:true})
 window.addEventListener('whisper-languagechange',()=>{popup.setAttribute('aria-label',t('blockMenu'));hide()})
 document.addEventListener('whisper:insert-block',()=>{
  source=plain.hidden?rich:plain;tools.focusBlock();source.focus();convert=false;suppressed=false;
  if(source===plain){const at=plain.selectionStart;const line=plain.value.slice(0,at).split('\n').pop();plain.setRangeText((line?'\n':'')+'/',at,plain.selectionEnd,'end');plain.dispatchEvent(new Event('input',{bubbles:true}))}
  else{tools.insertAfter();document.execCommand('insertText',false,'/');rich.dispatchEvent(new Event('input',{bubbles:true}))}
  schedule()
 })
 schedule()
}
