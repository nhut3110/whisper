import {hasHTML,hasMarkdown} from '/format.js';
import DOMPurify from '/purify.js';
import {marked} from '/marked.js';
export function clean(html){
 const fragment=DOMPurify.sanitize(html,{
  ALLOWED_TAGS:['p','div','br','strong','b','em','i','u','s','del','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','th','td','a'],
  ALLOWED_ATTR:['href','title'],ALLOWED_URI_REGEXP:/^https:\/\//i,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true,
 });
 for(const link of fragment.querySelectorAll('a')){
  if(!/^https:\/\//i.test(link.getAttribute('href')||'')){link.replaceWith(...link.childNodes);continue;}
  link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';
 }
 const root=document.createElement('div');root.append(fragment);return root.innerHTML;
}
export function fromText(text){const el=document.createElement('div');el.textContent=text;return el.innerHTML.replaceAll('\n','<br>');}
// HTML never bypasses the same allowlist, including HTML embedded in Markdown.
export function automatic(text){return hasMarkdown(text)?clean(marked.parse(text,{gfm:true,breaks:false,async:false})):hasHTML(text)?clean(text):null;}
