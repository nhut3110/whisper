import {useEffect,useRef,useState} from 'react'
import {ArrowUpRight,Link2} from 'lucide-react'
export type PreviewData={title?:string,description?:string,image?:{type:string,data:string}}
export function LinkPreview({url,open,standalone=false,load}:{url:URL,open:(url:string)=>void,standalone?:boolean,load:(url:string)=>Promise<PreviewData>}){
 const card=useRef<HTMLButtonElement>(null)
 const [metadata,setMetadata]=useState<PreviewData>({}),[image,setImage]=useState('')
 useEffect(()=>{
  let active=true,started=false,objectURL=''
  const begin=()=>{if(started)return;started=true;void load(url.href).then(data=>{
   if(!active)return
   if(data.image&&['image/png','image/jpeg','image/webp'].includes(data.image.type)&&data.image.data.length<1030000){try{const bytes=Uint8Array.from(atob(data.image.data),c=>c.charCodeAt(0));objectURL=URL.createObjectURL(new Blob([bytes],{type:data.image.type}));setImage(objectURL)}catch{}}
   setMetadata({title:data.title,description:data.description})
  }).catch(()=>{})}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();begin()}},{rootMargin:'100px'})
  if(card.current)observer.observe(card.current)
  return()=>{active=false;observer.disconnect();if(objectURL)URL.revokeObjectURL(objectURL)}
 },[url.href,load])
 const rich=!!metadata.title||!!metadata.description||!!image
 return <button ref={card} type="button" className={'chat-link-card'+(standalone?' chat-text-link':'')+(rich?' chat-link-rich':'')+(image?' chat-link-with-image':'')} title={url.href} onClick={()=>open(url.href)}>
  {image?<img className="chat-link-image" src={image} alt="" loading="lazy" decoding="async" onError={()=>setImage('')}/>:<span className="chat-link-icon" aria-hidden="true"><Link2/></span>}
  <span className="chat-link-details"><span className="chat-link-domain">{url.hostname}</span><strong>{metadata.title||url.hostname}</strong>{metadata.description&&<span className="chat-link-description">{metadata.description}</span>}<small>{url.href}</small></span><ArrowUpRight className="chat-link-arrow" aria-hidden="true"/>
 </button>
}
