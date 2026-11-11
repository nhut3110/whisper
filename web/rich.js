import DOMPurify from '/purify.js';
export const clean = html => DOMPurify.sanitize(html,{
  ALLOWED_TAGS:['p','div','br','strong','b','em','i','u','s','ul','ol','li','blockquote','pre','code'],
  ALLOWED_ATTR:[],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,
});
export function fromText(text){const el=document.createElement('div');el.textContent=text;return el.innerHTML.replaceAll('\n','<br>');}
