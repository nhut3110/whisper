import {hasHTML,hasMarkdown} from '/format.js';
import DOMPurify from '/purify.js';
import {marked} from '/marked.js';
marked.use({extensions:[{name:'whisperSpoiler',level:'inline',start(src){return src.indexOf('||')},tokenizer(src){const m=/^\|\|([^\n]+?)\|\|/.exec(src);if(m)return {type:'whisperSpoiler',raw:m[0],tokens:this.lexer.inlineTokens(m[1])}},renderer(token){return '<span data-spoiler>'+this.parser.parseInline(token.tokens)+'</span>'}}]});
const tags=['p','div','br','span','strong','b','em','i','u','s','del','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','th','td','a','details','summary','mark','aside'];
const colors={gray:['#787774','rgb(120, 119, 116)'],brown:['#9f6b53'],orange:['#d9730d'],yellow:['#cb912f'],green:['#448361'],blue:['#337ea9'],purple:['#9065b0'],pink:['#c14c8a'],red:['#d44c47']};
const colorToken=value=>{let normalized=value?.toLowerCase();const rgb=normalized?.match(/^rgb\((\d+), (\d+), (\d+)\)$/);if(rgb)normalized='#'+rgb.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join('');return Object.keys(colors).find(key=>colors[key].includes(normalized));};
// Notion exports either semantic HTML or DOM fragments from its canvas. Convert
// canvas blocks before discarding their classes and layout styles.
const notionBlockSelector=['text','to_do','toggle','bulleted_list','numbered_list','header','sub_header','sub_sub_header','quote','code','callout','divider'].map(type=>'.notion-'+type+'-block').join(',');
function appendBlocks(parent,blocks){
 for(const node of blocks){
  const previous=parent.lastElementChild;
  if(node.nodeType===1&&/^(UL|OL)$/.test(node.tagName)&&previous?.tagName===node.tagName&&previous.dataset.kind===node.dataset.kind)previous.append(...node.childNodes);
  else parent.append(node);
 }
}
function normalizeNotionDOM(fragment){
 if(!fragment.querySelector(notionBlockSelector))return;
 const roots=node=>[...node.querySelectorAll(notionBlockSelector)].filter(child=>{let parent=child.parentElement;while(parent&&parent!==node){if(parent.matches(notionBlockSelector))return false;parent=parent.parentElement;}return true;});
 function convert(node,depth=0){
  if(depth>32)return [];
  const leaf=[...node.querySelectorAll('[data-content-editable-leaf],[contenteditable="true"]')].find(el=>el.closest(notionBlockSelector)===node);
  const nested=roots(node).flatMap(child=>convert(child,depth+1));
  const type=[...node.classList].find(name=>/^notion-.*-block$/.test(name))?.slice(7,-6);
  if(!leaf&&type!=='divider')return nested; // Empty Notion overlay/duplicate block.
  const content=document.createDocumentFragment();if(leaf)content.append(...leaf.cloneNode(true).childNodes);
  const heading={header:'h1',sub_header:'h2',sub_sub_header:'h3'}[type];
  const el=document.createElement(heading||({quote:'blockquote',code:'pre',callout:'aside',toggle:'details',divider:'hr'}[type])||(['to_do','bulleted_list','numbered_list'].includes(type)?type==='numbered_list'?'ol':'ul':'p'));
  if(type==='toggle'){const summary=document.createElement('summary');summary.append(content);el.append(summary);if(node.querySelector('[aria-expanded="true"]'))el.setAttribute('open','');}
  else if(el.matches('ul,ol')){const li=document.createElement('li');li.append(content);if(type==='to_do'){el.dataset.kind='task';li.dataset.checked=String(!!node.querySelector('input[type="checkbox"][checked]'));}appendBlocks(li,nested);el.append(li);return [el];}
  else if(type!=='divider'){el.append(content);if(!el.childNodes.length)el.append(document.createElement('br'));if(type==='callout')el.dataset.kind='callout';}
  if(nested.length){if(el.matches('p,h1,h2,h3,hr'))return [el,...nested];appendBlocks(el,nested);}
  return [el];
 }
 function walk(node,depth=0){
  if(depth>48)return [];
  if(node.nodeType===3)return node.textContent.trim()?[node.cloneNode()]:[];
  if(node.nodeType!==1&&node.nodeType!==11)return [];
  if(node.nodeType===1){
   if(node.matches(notionBlockSelector))return convert(node);
   if(node.matches('[data-content-editable-void],.notion-selectable-halo,.content-editable-void-no-select'))return [];
   if(node.matches('h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table,details,aside'))return [node.cloneNode(true)];
   // All remaining Notion layout wrappers are unwrapped; only content survives.
  }
  return [...node.childNodes].flatMap(child=>walk(child,depth+1));
 }
 const output=document.createDocumentFragment();appendBlocks(output,walk(fragment));fragment.replaceChildren(output);
}
// Native block-copy includes a private MIME payload. Read only its content fields;
// IDs, authors, workspace metadata and resource URLs never enter the message.
export function notionBlocks(raw){
 if(typeof raw!=='string'||raw.length>2_000_000)return null;
 try{
  const data=JSON.parse(raw);if(!Array.isArray(data.blocks)||!data.blocks.length||data.blocks.length>2000)return null;
  const records=new Map();for(const root of data.blocks){const values=root?.blockSubtree?.block;if(values&&typeof values==='object')for(const [id,record] of Object.entries(values)){if(records.size>=4000)return null;if(record?.value&&typeof record.value.type==='string')records.set(id,record.value);}}
  if(data.blocks.some(root=>!records.has(root.blockId)))return null;
  const path=new Set();let remaining=4000,textBudget=1_000_000;
  function title(value){
   const output=document.createDocumentFragment();if(!Array.isArray(value))return output;
   for(const part of value.slice(0,4000)){
    if(!Array.isArray(part)||typeof part[0]!=='string')continue;
    textBudget-=part[0].length;if(textBudget<0)throw new Error('Clipboard content limit');
    let node=document.createTextNode(part[0]);
    if(Array.isArray(part[1]))for(const mark of part[1].slice(0,20)){
     if(!Array.isArray(mark))continue;
     const tag={b:'strong',i:'em',s:'s',c:'code',_:'u'}[mark[0]];let wrapper;
     if(tag)wrapper=document.createElement(tag);
     else if(mark[0]==='a'&&typeof mark[1]==='string'&&/^https:\/\//i.test(mark[1])){wrapper=document.createElement('a');wrapper.setAttribute('href',mark[1]);}
     else if(mark[0]==='h'&&typeof mark[1]==='string'){const color=mark[1].replace(/_background$/,'');if(Object.hasOwn(colors,color)){wrapper=document.createElement('span');wrapper.dataset[mark[1].endsWith('_background')?'highlight':'color']=color;}}
     if(wrapper){wrapper.append(node);node=wrapper;}
    }
    output.append(node);
   }return output;
  }
  function render(id,depth=0){
   if(depth>32||remaining--<=0||path.has(id))return [];
   const value=records.get(id);if(!value)return [];path.add(id);
   const type=value.type,children=Array.isArray(value.content)?value.content.slice(0,2000).flatMap(child=>render(child,depth+1)):[];
   path.delete(id);
   const tag=({header:'h1',sub_header:'h2',sub_sub_header:'h3',quote:'blockquote',code:'pre',callout:'aside',toggle:'details',divider:'hr'}[type])||(['to_do','bulleted_list','numbered_list'].includes(type)?type==='numbered_list'?'ol':'ul':'p');
   const node=document.createElement(tag),content=title(value.properties?.title);
   if(type==='divider')return [node,...children];
   if(type==='toggle'){const summary=document.createElement('summary');summary.append(content);node.append(summary);appendBlocks(node,children);}
   else if(node.matches('ul,ol')){const li=document.createElement('li');li.append(content);if(type==='to_do'){node.dataset.kind='task';li.dataset.checked=String(value.properties?.checked?.[0]?.[0]==='Yes');}appendBlocks(li,children);node.append(li);}
   else{node.append(content);if(type==='callout'){node.dataset.kind='callout';appendBlocks(node,children);}else if(children.length)return [node,...children];}
   if(!node.childNodes.length)node.append(document.createElement('br'));
   return [node];
  }
  const root=document.createElement('div');appendBlocks(root,data.blocks.flatMap(item=>render(item.blockId)));
  return root.textContent?.trim()?clean(root.innerHTML):null;
 }catch{return null;}
}
export function clean(html){
 // Sanitize before normalization. CSS is read only in this detached fragment,
 // mapped to finite semantic tokens, and never inserted into the live document.
 const fragment=DOMPurify.sanitize(html,{
  ALLOWED_TAGS:[...tags,'font','input','label'],ALLOWED_ATTR:['href','title','style','class','color','type','checked','data-kind','data-checked','data-color','data-highlight','data-spoiler','data-spoiler-caret','data-notion-highlight','contenteditable','data-content-editable-leaf','data-content-editable-void','aria-expanded'],
  ADD_URI_SAFE_ATTR:['color','type','data-kind','data-checked','data-color','data-highlight','data-spoiler','data-spoiler-caret','data-notion-highlight','contenteditable','data-content-editable-leaf','data-content-editable-void','aria-expanded'],ALLOWED_URI_REGEXP:/^https:\/\//i,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true,
 });
 for(const host of fragment.querySelectorAll('[data-spoiler-caret]')){const walk=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);while(walk.nextNode())walk.currentNode.textContent=walk.currentNode.textContent.replace(/\u200b/g,'');host.replaceWith(...host.childNodes)}
 normalizeNotionDOM(fragment);
 for(const input of fragment.querySelectorAll('input')){
  if(input.getAttribute('type')==='checkbox'){
   const li=input.closest('li');if(li){li.dataset.checked=String(input.hasAttribute('checked'));li.parentElement.dataset.kind='task';}
   else{const marker=document.createElement('span');marker.textContent=input.hasAttribute('checked')?'☑ ':'☐ ';input.replaceWith(marker);}
  }
  input.remove();
 }
 for(const li of fragment.querySelectorAll('li')){
  const first=li.firstChild,match=first?.nodeType===3&&first.textContent.match(/^\s*\[([ xX])\]\s+/);
  if(match){first.textContent=first.textContent.slice(match[0].length);li.dataset.checked=String(match[1].toLowerCase()==='x');}
 }
 for(const list of fragment.querySelectorAll('ul'))if([...list.children].length&&[...list.children].every(li=>li.hasAttribute('data-checked')))list.dataset.kind='task';
 for(const node of [...fragment.querySelectorAll('*')].reverse()){
  const css=node.style;let replacement=node;
  if(node.classList.contains('notion-inline-code-container')){replacement=document.createElement('code');replacement.append(...node.childNodes);node.replaceWith(replacement);}
  const wrap=tag=>{const el=document.createElement(tag);el.append(...replacement.childNodes);replacement.append(el);};
  if((Number.parseInt(css.fontWeight,10)>=600||css.fontWeight==='bold')&&!/^(B|STRONG|H[1-6])$/.test(node.tagName))wrap('strong');
  if(css.fontStyle==='italic'&&!/^(I|EM)$/.test(node.tagName))wrap('em');
  if(css.textDecoration.includes('line-through')&&!/^(S|DEL)$/.test(node.tagName))wrap('s');
  if(css.textDecoration.includes('underline')&&node.tagName!=='U')wrap('u');
  const color=colorToken(css.color||node.getAttribute('color'));if(color)replacement.dataset.color=color;
  const notionTone=node.getAttribute('data-notion-highlight')||'';
  if(Object.hasOwn(colors,notionTone))replacement.dataset.color=notionTone;
  const highlight=(notionTone.endsWith('_background')?notionTone.replace('_background',''):'')||colorToken(css.backgroundColor);
  if(highlight&&Object.hasOwn(colors,highlight))replacement.dataset.highlight=highlight;
  if(node.tagName==='FONT'){const span=document.createElement('span');span.append(...node.childNodes);if(color)span.dataset.color=color;node.replaceWith(span);replacement=span;}
  const kind=replacement.getAttribute('data-kind');if(kind&&!['task','callout'].includes(kind))replacement.removeAttribute('data-kind');
  if(replacement.hasAttribute('data-checked')&&!['true','false'].includes(replacement.dataset.checked))replacement.removeAttribute('data-checked');
  for(const attribute of ['data-color','data-highlight'])if(replacement.hasAttribute(attribute)&&!Object.hasOwn(colors,replacement.getAttribute(attribute)))replacement.removeAttribute(attribute);
 }
 const root=document.createElement('div');root.append(fragment);
 return finalize(root);
}
function finalize(root){
 root.innerHTML=DOMPurify.sanitize(root.innerHTML,{ALLOWED_TAGS:tags,ALLOWED_ATTR:['href','title','data-kind','data-checked','data-color','data-highlight','data-spoiler'],ADD_URI_SAFE_ATTR:['data-kind','data-checked','data-color','data-highlight','data-spoiler'],ALLOWED_URI_REGEXP:/^https:\/\//i,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false});
 for(const link of root.querySelectorAll('a')){
  if(!/^https:\/\//i.test(link.getAttribute('href')||'')){link.replaceWith(...link.childNodes);continue;}
  link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';
 }
 return root.innerHTML;
}
export function fromText(text){const el=document.createElement('div');el.textContent=text;return el.innerHTML.replaceAll('\n','<br>');}
// Clipboard HTML takes precedence; Markdown is parsed only when the input is text.
export function automatic(text){return hasHTML(text)?clean(text):hasMarkdown(text)?clean(marked.parse(text,{gfm:true,breaks:false,async:false})):null;}
export function clipboard(html,text,notion){return (notion&&notionBlocks(notion))||(html?clean(html):automatic(text)||fromText(text));}
