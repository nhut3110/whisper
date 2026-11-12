// Selection/clipboard bridge. shadcn + Radix own rendering, focus and dismissal.
export function editorMenu({copy,notify,inspect,t}){
 let target=null,range=null,snapshot=null,selection='',restoreFocus=null,generation=0,opened=false;
 const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(`whisper:menu-${name}`,{detail}));
 const writable=e=>e instanceof HTMLElement&&!e.closest('[hidden]')&&((e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)&&!e.readOnly&&!e.disabled&&['text','search','url','email','tel','password','textarea'].includes(e.type)||e.isContentEditable);
 function dismiss(focus=false){opened=false;emit('close');if(focus)restoreFocus?.focus({preventScroll:true});}
 function restore(){target?.focus({preventScroll:true});if(snapshot&&target?.value===snapshot.value)target.setSelectionRange(snapshot.start,snapshot.end);else if(range&&target?.contains(range.commonAncestorContainer)){const s=getSelection();s.removeAllRanges();s.addRange(range);}}
 function replace(text){
  if(!writable(target)||!target.isConnected)return false;
  if(snapshot){if(target.value!==snapshot.value)return false;target.setRangeText(text,snapshot.start,snapshot.end,'end');}
  else{if(!range||!target.contains(range.commonAncestorContainer))return false;restore();document.execCommand('insertText',false,text);}
  target.dispatchEvent(new Event('input',{bubbles:true}));return true;
 }
 document.addEventListener('pointerdown',e=>{if(e.button===2)emit('warm');});
 document.addEventListener('contextmenu',e=>{
  if(e.target instanceof Element&&e.target.closest('#context-menu-host'))return;
  e.preventDefault();generation++;dismiss();restoreFocus=document.activeElement;
  const element=e.target instanceof Element?e.target:null;
  target=element?.closest('input,textarea,[contenteditable=true]')||null;range=null;snapshot=null;selection='';
  if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement){
   const start=target.selectionStart,end=target.selectionEnd;
   if(start!==null){snapshot={start,end,value:target.value};selection=target.value.slice(start,end);}
   if(!selection&&target.readOnly)selection=target.value;
  }else{const s=getSelection();selection=s?.toString()||'';if(s?.rangeCount)range=s.getRangeAt(0).cloneRange();}
  const token=generation,anchor=element?.getBoundingClientRect();opened=true;
  emit('open',{x:e.clientX||anchor?.left||8,y:e.clientY||anchor?.bottom||8,container:element?.closest('dialog[open]')||undefined,
   items:['copy','paste','cut'].map(action=>({action,label:t(action),disabled:action==='copy'?!selection:action==='cut'?!selection||!writable(target):!writable(target)})),
   closed(){if(token===generation)opened=false;},
   async select(action){
    if(token!==generation)return;dismiss();restore();
    if(action==='copy')await copy(selection);
    if(action==='cut'&&await copy(selection)&&token===generation)replace('');
    if(action==='paste')try{
     const text=await navigator.clipboard.readText();if(token!==generation)return;
     let html='',notion='';
     if(target?.matches('#message,#rich-editor')&&navigator.clipboard.read)try{
      const items=await navigator.clipboard.read(),item=items.find(item=>item.types.includes('text/html'));if(item)html=await (await item.getType('text/html')).text();
      const blocks=items.find(item=>item.types.includes('text/_notion-blocks-v3-production'));if(blocks)notion=await (await blocks.getType('text/_notion-blocks-v3-production')).text();
     }catch{/* Plain text remains available when HTML clipboard access is unsupported. */}
     if(token!==generation||!writable(target)||snapshot&&target.value!==snapshot.value)return;
     restore();
     if(target.matches('#message,#rich-editor')){
      const data=new DataTransfer();data.setData('text/plain',text);if(html)data.setData('text/html',html);if(notion)data.setData('text/_notion-blocks-v3-production',notion);
      const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});target.dispatchEvent(event);if(event.defaultPrevented)return;
     }
     replace(text);
    }catch{notify(t('pasteShortcut'));}
   }
  });notify();
 });
 for(const event of ['scroll','resize'])window.addEventListener(event,()=>{if(opened)dismiss();},{passive:true});
 document.addEventListener('keydown',e=>{
  if(e.key==='F12'||((e.ctrlKey&&e.shiftKey||e.metaKey&&e.altKey)&&['i','j','c'].includes(e.key.toLowerCase()))){e.preventDefault();dismiss();inspect();return;}
  if(opened&&e.key==='Escape'){e.preventDefault();dismiss(true);}
 },true);
 window.addEventListener('pagehide',()=>{generation++;dismiss();target=range=snapshot=null;selection='';});
 return {dismiss(){generation++;dismiss();target=range=snapshot=restoreFocus=null;selection='';}};
}
