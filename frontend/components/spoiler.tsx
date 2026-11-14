import {useState,useRef,useLayoutEffect,type ReactNode} from 'react'
import {spoilerParts,decorateSpoiler,disposeSpoiler} from '../../web/spoiler.js'
export function SpoilerText({text,render}:{text:string,render:(text:string)=>ReactNode}){
 return <>{spoilerParts(text).map((p,i)=>p.hidden?<Hidden key={i+':'+p.text} text={p.text} render={render}/>:<span key={i}>{render(p.text)}</span>)}</>
}
function Hidden({text,render}:{text:string,render:(text:string)=>ReactNode}){
 const [open,setOpen]=useState(false),ref=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{const el=ref.current;if(!open&&el)decorateSpoiler(el,text);return()=>{if(el)disposeSpoiler(el)}},[text,open]);
 const reveal=()=>{if(ref.current)disposeSpoiler(ref.current,true);setOpen(true)};
 return open?<span key="revealed" className="spoiler-revealed"><span className="spoiler-burst" aria-hidden="true"/>{render(text)}</span>:<span key="concealed" ref={ref} role="button" tabIndex={0} className="whisper-spoiler" aria-label={document.documentElement.lang.startsWith('vi')?'Bấm để hiện đoạn đã che':'Reveal hidden text'} onClick={reveal} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal()}}}></span>
}
