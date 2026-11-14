// Spoiler bodies stay in JS memory, never hidden DOM/ARIA attributes.
export function spoilerParts(text){
 const out=[];let at=0;const pattern=/\|\|([^\n]+?)\|\|/g;let m;
 while((m=pattern.exec(text))){if(m.index>at)out.push({text:text.slice(at,m.index),hidden:false});out.push({text:m[1],hidden:true});at=m.index+m[0].length;}
 if(at<text.length)out.push({text:text.slice(at),hidden:false});return out;
}
export function spoilerSummary(text){return spoilerParts(text).map(p=>p.hidden?'[•••]':p.text).join('');}
let particleModule;
const painters=new WeakMap();
function particles(){return particleModule??=import('./spoiler-particles.js');}
export function disposeSpoiler(element,burst=false){painters.get(element)?.(burst);painters.delete(element);}
/** Measure in memory, never insert concealed text, even in invisible elements. */
export function decorateSpoiler(button,text){
 const source=button.isConnected?button:document.getElementById('plaintext')||document.body;
 const style=getComputedStyle(source),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(!ctx)return;
 ctx.font=style.font||`${style.fontSize||'16px'} ${style.fontFamily||'sans-serif'}`;
 const letterSpacing=parseFloat(style.letterSpacing)||0;
 const fragment=document.createDocumentFragment();
 const lines=text.slice(0,32768).split('\n');
 for(const [lineIndex,line] of lines.entries()){
 if(lineIndex)fragment.append(document.createElement('br'));
 const words=line.match(/\S+[^\S\n]*|[^\S\n]+/gu)||[' '];
 // Keep very long messages bounded; each piece still wraps independently.
 const stride=Math.max(1,Math.ceil(words.length/512));
 let count=0;
 chunks:for(let at=0;at<words.length;at+=stride){
  const word=words.slice(at,at+stride).join(''),trailing=word.match(/\s+$/u)?.[0]||'',body=word.slice(0,word.length-trailing.length);
  const chunks=body.match(/.{1,32}/gu)||[];
  for(const chunk of chunks){if(count>=512)break chunks;const piece=document.createElement('span');piece.className='spoiler-piece';if(count++<72)piece.dataset.motion='';piece.setAttribute('aria-hidden','true');piece.style.width=Math.max(2,ctx.measureText(chunk).width+letterSpacing*chunk.length)+'px';
   fragment.append(piece);}
  if(trailing)fragment.append(document.createTextNode(' '));
 }
 }
 disposeSpoiler(button);button.replaceChildren(fragment);void particles().then(({registerParticles})=>{if(button.isConnected)painters.set(button,registerParticles(button,()=>[...button.querySelectorAll('.spoiler-piece')].map(piece=>piece.getBoundingClientRect())))});
}
const revealed=new WeakSet();
export function concealNode(node){
 const content=document.createDocumentFragment();content.append(...node.childNodes);
 const label=document.documentElement.lang.startsWith('vi')?'Bấm để hiện đoạn đã che':'Reveal hidden text';
 const button=document.createElement('span');button.setAttribute('role','button');button.tabIndex=0;button.className='whisper-spoiler';button.setAttribute('aria-label',label);
 // Dust follows typographic length but contains no legible glyphs.
 queueMicrotask(()=>{if(button.isConnected){const measurement=content.cloneNode(true);for(const br of measurement.querySelectorAll('br'))br.replaceWith('\n');decorateSpoiler(button,measurement.textContent||'')}});
 button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();button.click()}});
 button.addEventListener('click',()=>{if(revealed.has(button))return;revealed.add(button);disposeSpoiler(button,true);const span=document.createElement('span');span.className='spoiler-revealed';const burst=document.createElement('span');burst.className='spoiler-burst';burst.setAttribute('aria-hidden','true');span.append(burst,content);button.replaceWith(span);},{once:true});
 node.replaceWith(button);return button;
}
export function protectSpoilers(root){
 for(const el of root.querySelectorAll('[data-spoiler]')){let parent=el.parentElement;while(parent&&parent!==root){parent.removeAttribute('title');if(parent.tagName==='A')parent.removeAttribute('href');parent=parent.parentElement;}}
 for(const el of [...root.querySelectorAll('[data-spoiler]')])if(el.isConnected||root.contains(el))concealNode(el);
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walk.nextNode())nodes.push(walk.currentNode);
 for(const node of nodes){if(node.parentElement?.closest('code,pre,button'))continue;const parts=spoilerParts(node.textContent||'');if(!parts.some(p=>p.hidden))continue;const f=document.createDocumentFragment();for(const part of parts){if(!part.hidden)f.append(document.createTextNode(part.text));else{const span=document.createElement('span');span.textContent=part.text;f.append(span);concealNode(span);}}node.replaceWith(f);}
}
export function safeCopy(root){const clone=root.cloneNode(true);for(const img of clone.querySelectorAll('img[data-emoji]'))img.replaceWith(document.createTextNode(img.dataset.emoji));for(const node of clone.querySelectorAll('.block-copy'))node.remove();for(const node of clone.querySelectorAll('.whisper-spoiler'))node.replaceWith(document.createTextNode('[•••]'));const plain=node=>{if(node.nodeType===3)return node.textContent||'';if(node.nodeName==='BR')return '\n';let text=[...node.childNodes].map(plain).join('');if(/^(P|DIV|LI|H[1-6]|BLOCKQUOTE|TR|PRE)$/.test(node.nodeName)&&text&&!text.endsWith('\n'))text+='\n';return text;};const text=clone.querySelector('p,h1,h2,h3,li,blockquote,pre,table')?plain(clone).replace(/\n$/,''):clone.textContent||'';return {text,html:clone.innerHTML};}
