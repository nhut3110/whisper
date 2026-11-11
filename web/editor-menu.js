// A convenience menu, not a security boundary. Browser/OS controls remain user-owned.
export function editorMenu({copy,notify,inspect,t}){
 const menu=document.getElementById('edit-menu');let target=null,range=null,snapshot=null,selection='',restoreFocus=null,generation=0;
 const buttons=[...menu.querySelectorAll('[data-edit]')];
 const writable=e=>e instanceof HTMLElement&&!e.closest('[hidden]')&&((e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)&&!e.readOnly&&!e.disabled&&['text','search','url','email','tel','password','textarea'].includes(e.type)||e.isContentEditable);
 function dismiss(focus=false){if(menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;if(focus)restoreFocus?.focus({preventScroll:true});}
 function restore(){target?.focus({preventScroll:true});if(snapshot&&target?.value===snapshot.value)target.setSelectionRange(snapshot.start,snapshot.end);else if(range&&target?.contains(range.commonAncestorContainer)){const s=getSelection();s.removeAllRanges();s.addRange(range);}}
 function replace(text){
  if(!writable(target)||!target.isConnected)return false;
  if(snapshot){if(target.value!==snapshot.value)return false;target.setRangeText(text,snapshot.start,snapshot.end,'end');}
  else{if(!range||!target.contains(range.commonAncestorContainer))return false;restore();document.execCommand('insertText',false,text);}
  target.dispatchEvent(new Event('input',{bubbles:true}));return true;
 }
 document.addEventListener('contextmenu',e=>{
  e.preventDefault();generation++;dismiss();restoreFocus=document.activeElement;
  const element=e.target instanceof Element?e.target:null;
  target=element?.closest('input,textarea,[contenteditable=true]')||null;range=null;snapshot=null;selection='';
  if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement){
   const start=target.selectionStart,end=target.selectionEnd;
   if(start!==null){snapshot={start,end,value:target.value};selection=target.value.slice(start,end);}
   if(!selection&&target.readOnly)selection=target.value;
  }else{const s=getSelection();selection=s?.toString()||'';if(s?.rangeCount)range=s.getRangeAt(0).cloneRange();}
  buttons.find(b=>b.dataset.edit==='copy').disabled=!selection;
  buttons.find(b=>b.dataset.edit==='cut').disabled=!selection||!writable(target);
  buttons.find(b=>b.dataset.edit==='paste').disabled=!writable(target);
  menu.hidden=false;menu.showPopover();
  const r=menu.getBoundingClientRect(),anchor=element?.getBoundingClientRect();
  const x=e.clientX||anchor?.left||8,y=e.clientY||anchor?.bottom||8;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
  (buttons.find(b=>!b.disabled)||menu).focus({preventScroll:true});notify();
 });
 menu.addEventListener('pointerdown',e=>e.preventDefault());
 menu.addEventListener('click',async e=>{
  const action=e.target.closest('[data-edit]')?.dataset.edit;if(!action)return;
  const token=generation;dismiss();restore();
  if(action==='copy')await copy(selection);
  if(action==='cut'&&await copy(selection)&&token===generation)replace('');
  if(action==='paste')try{const text=await navigator.clipboard.readText();if(token===generation){restore();replace(text);}}catch{notify(t('pasteShortcut'));}
 });
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))dismiss();},true);
 for(const event of ['scroll','resize'])window.addEventListener(event,()=>dismiss(),{passive:true});
 document.addEventListener('keydown',e=>{
  if(e.key==='F12'||((e.ctrlKey&&e.shiftKey||e.metaKey&&e.altKey)&&['i','j','c'].includes(e.key.toLowerCase()))){e.preventDefault();dismiss();inspect();return;}
  if(!menu.matches(':popover-open'))return;
  if(e.key==='Escape'){e.preventDefault();dismiss(true);return;}
  if(e.key==='Tab'){dismiss(true);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();const active=buttons.filter(b=>!b.disabled);if(!active.length)return;
   const i=active.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?active.length-1:(i+(e.key==='ArrowDown'?1:-1)+active.length)%active.length;active[next].focus();
  }
 },true);
 window.addEventListener('pagehide',()=>{dismiss();target=range=snapshot=null;selection='';});
 return {dismiss(){generation++;dismiss();target=range=snapshot=restoreFocus=null;selection='';}};
}
