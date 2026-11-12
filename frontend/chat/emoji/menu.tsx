import {lazy,Suspense,useState,useCallback,useRef,useLayoutEffect,useEffect,type ReactNode} from 'react'
import {Plus,LoaderCircle} from 'lucide-react'
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover'
import {Button} from '@/components/ui/button'
import {morphPopover,reducedMotion} from './motion'
const loadPicker=()=>import('./picker')
const Picker=lazy(loadPicker)
export function EmojiMenu({children,onSelect,lang,align='start',quick=false}:{children:ReactNode,onSelect:(v:string)=>void,lang:string,align?:'start'|'end',quick?:boolean}){
 const [open,setOpen]=useState(false),[expanded,setExpanded]=useState(!quick),[selecting,setSelecting]=useState(false)
 const panel=useRef<HTMLDivElement>(null),previous=useRef<DOMRect|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 useEffect(()=>()=>clearTimeout(timer.current),[])
 const select=useCallback((value:string)=>{if(selecting)return;onSelect(value);setSelecting(true);if(reducedMotion()){setOpen(false);return}timer.current=setTimeout(()=>setOpen(false),140)},[onSelect,selecting])
 useLayoutEffect(()=>{
  if(!expanded||!previous.current)return
  const from=previous.current;previous.current=null;let second=0
  const frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{if(panel.current)morphPopover(panel.current,from)})})
  return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second)}
 },[expanded])
 return <Popover open={open} onOpenChange={value=>{clearTimeout(timer.current);setOpen(value);setSelecting(false);if(value){setExpanded(!quick);previous.current=null}}}><PopoverTrigger asChild onPointerEnter={()=>void loadPicker()} onFocus={()=>void loadPicker()}>{children}</PopoverTrigger><PopoverContent ref={panel} data-selecting={selecting} className={expanded?'chat-full-emoji-picker':'chat-quick-reaction-picker'} side="top" align={align} sideOffset={8} collisionPadding={12} onCloseAutoFocus={e=>e.preventDefault()}>
  {!expanded?<div className="chat-quick-emojis">{['❤️','😂','😮','😢','👍','🔥'].map((value,index)=><Button key={value} className="chat-quick-choice" style={{'--emoji-order':index} as React.CSSProperties} variant="ghost" size="icon" disabled={selecting} onClick={event=>{if(!reducedMotion())event.currentTarget.animate([{transform:'scale(1)'},{transform:'translateY(-5px) scale(1.28)',offset:.45},{transform:'scale(.85)',opacity:0}],{duration:150,easing:'ease-out'});select(value)}} aria-label={value}><span>{value}</span></Button>)}<Button className="chat-more-emojis" variant="ghost" size="icon" aria-label={lang==='vi'?'Thêm cảm xúc':'More reactions'} onClick={()=>{previous.current=panel.current?.getBoundingClientRect()||null;setExpanded(true)}}><Plus/></Button></div>:<div className="chat-picker-reveal"><Suspense fallback={<div className="chat-picker-loading" role="status" aria-label={lang==='vi'?'Đang tải emoji':'Loading emoji'}><LoaderCircle/></div>}>{open&&<Picker lang={lang} onSelect={select}/>}</Suspense></div>}
 </PopoverContent></Popover>
}
