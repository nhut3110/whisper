import {registerParticles,invalidate} from '../web/spoiler-particles.js'
/** A neutral caret host prevents browsers inheriting the previous inline mark. */
export function leaveSpoiler(mark:Element){
 let host=mark.nextSibling;
 if(!(host instanceof HTMLElement)||!host.hasAttribute('data-spoiler-caret')){
  host=document.createElement('span');(host as HTMLElement).dataset.spoilerCaret='';host.textContent='\u200b';mark.after(host);
 }
 const range=document.createRange();const first=host.firstChild;if(first?.nodeType===Node.TEXT_NODE){range.setStart(first,first.textContent?.startsWith('\u200b')?1:0);range.collapse(true)}else{range.selectNodeContents(host);range.collapse(true)}
 const selection=getSelection();selection?.removeAllRanges();selection?.addRange(range);
}
/** Decorations live outside contenteditable; the author keeps normal text/undo/paste. */
export function installSpoilerEditor(editor:HTMLElement){
 const marks=new Map<HTMLElement,()=>void>();let scheduled=0;
 function update(){
  scheduled=0;const selection=getSelection();const node=selection?.anchorNode;
  const active=document.activeElement===editor?(node instanceof Element?node:node?.parentElement)?.closest<HTMLElement>('[data-spoiler]'):null;
  for(const [mark,dispose] of marks)if(!editor.contains(mark)){dispose();marks.delete(mark)}
  for(const mark of editor.querySelectorAll<HTMLElement>('[data-spoiler]')){
   mark.classList.toggle('spoiler-editing',mark===active);
   if(!marks.has(mark))marks.set(mark,registerParticles(mark,()=>{
    if(mark.classList.contains('spoiler-editing')||editor.hidden||editor.closest('[hidden]'))return [];
    const range=document.createRange();range.selectNodeContents(mark);return [...range.getClientRects()];
   }));
  }
  invalidate();
 }
 const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(update)};
 new MutationObserver(schedule).observe(editor,{childList:true,characterData:true,subtree:true});
 document.addEventListener('selectionchange',schedule);editor.addEventListener('focus',schedule);editor.addEventListener('blur',schedule);
 editor.addEventListener('keydown',event=>{
  if(event.isComposing||event.shiftKey||event.altKey||event.metaKey||event.ctrlKey||!['Escape','ArrowRight'].includes(event.key))return;
  const selection=getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return;
  const node=selection.anchorNode,active=(node instanceof Element?node:node?.parentElement)?.closest('[data-spoiler]');
  if(!active||!editor.contains(active))return;
  if(event.key==='ArrowRight'){const tail=document.createRange();tail.selectNodeContents(active);tail.setStart(selection.anchorNode!,selection.anchorOffset);if(tail.toString())return;}
  event.preventDefault();leaveSpoiler(active);schedule();
 });
 schedule();
}
