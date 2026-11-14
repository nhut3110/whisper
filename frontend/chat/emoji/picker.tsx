import {useEffect,useRef} from 'react'
import {Picker,init} from 'emoji-mart'
import data from './data.json'
import vi from '@emoji-mart/data/i18n/vi.json'
import en from '@emoji-mart/data/i18n/en.json'
import cssURL from './picker-shadow.css?url'
import scrollbarsURL from '../../scrollbars.css?url'
import {customPacks} from './index'
// Warm only in an active room's idle time; no hidden picker or background animation.
let preparedLanguage:string|undefined
export function preparePicker(lang:string){
 if(preparedLanguage===lang)return
 preparedLanguage=lang
 for(const href of [cssURL,scrollbarsURL]){
  if(document.querySelector(`link[rel=preload][href="${href}"]`))continue
  const link=document.createElement('link');link.rel='preload';link.as='style';link.href=href;document.head.append(link)
 }
 return init({data,set:'native',locale:lang,i18n:lang==='vi'?vi:en,perLine:8,maxFrequentRows:1})
}
class LocalPicker extends Picker{
 injectStyles(){const links=[cssURL,scrollbarsURL].map(href=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;return link});(this as unknown as HTMLElement).shadowRoot!.prepend(...links)}
}
if(!customElements.get('whisper-emoji-picker'))customElements.define('whisper-emoji-picker',LocalPicker as unknown as CustomElementConstructor)
export default function EmojiPicker({onSelect,lang}:{onSelect:(value:string)=>void,lang:string}){
 const host=useRef<HTMLDivElement>(null);const selected=useRef(onSelect);selected.current=onSelect
 useEffect(()=>{
  // Mark the active locale before idle warmup can run, including a touch-first open.
  void preparePicker(lang)
  const picker=new LocalPicker({data,locale:lang,i18n:lang==='vi'?vi:en,theme:document.documentElement.dataset.theme==='dark'?'dark':'light',set:'native',previewPosition:'none',skinTonePosition:'search',navPosition:'bottom',dynamicWidth:false,perLine:8,emojiButtonSize:34,emojiSize:25,maxFrequentRows:1,custom:customPacks.map(p=>({id:p.id,name:p.name,icon:{src:p.emojis[0]?.src},emojis:p.emojis.map(e=>({id:e.id,name:e.name,keywords:e.keywords,skins:[{src:e.src}]}))})),onEmojiSelect:(e:{id:string,native?:string})=>selected.current(e.native||`:${e.id}:`)})
  const element=picker as unknown as HTMLElement;const labelButtons=(root:Element)=>{if(root instanceof HTMLButtonElement&&root.title&&!root.hasAttribute('aria-label'))root.setAttribute('aria-label',root.title);root.querySelectorAll<HTMLButtonElement>('button[title]:not([aria-label])').forEach(button=>button.setAttribute('aria-label',button.title))};const labels=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)labelButtons(node)});labels.observe(element.shadowRoot!,{childList:true,subtree:true});
  const fitCategory=(event:Event)=>{const button=(event.target as Element).closest('button');if(!button?.closest('#nav')||!host.current)return;const pack=customPacks.find(p=>p.name===button.getAttribute('aria-label'));host.current.style.height=pack?`${Math.min(352,124+Math.ceil(pack.emojis.length/8)*34)}px`:''};
  const resetHeight=()=>{if(host.current)host.current.style.height=''};
  element.shadowRoot!.addEventListener('click',fitCategory);element.shadowRoot!.addEventListener('input',resetHeight);
  host.current?.append(element);const observer=new MutationObserver(()=>picker.update({theme:document.documentElement.dataset.theme==='dark'?'dark':'light'}));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>{observer.disconnect();labels.disconnect();element.shadowRoot!.removeEventListener('click',fitCategory);element.shadowRoot!.removeEventListener('input',resetHeight);(picker as unknown as HTMLElement).remove()}
 },[lang])
 return <div className="chat-picker-host" ref={host}/>
}
