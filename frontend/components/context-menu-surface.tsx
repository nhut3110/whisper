import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {ContextMenu,ContextMenuTrigger,ContextMenuContent,ContextMenuItem} from '@/components/ui/context-menu'
type Request = {x:number;y:number;container?:HTMLElement;items:{action:string;label:string;disabled:boolean}[];select:(action:string)=>void;closed:()=>void}
let host:HTMLDivElement,root:Root,active:Request|undefined,closing=false
export function closeMenu(){
 if(!root||closing)return
 closing=true;flushSync(()=>root.render(null));closing=false;active?.closed();active=undefined
}
export function openMenu(request:Request){
 closeMenu()
 if(!host){host=document.createElement('div');host.id='context-menu-host';root=createRoot(host)}
 const container=request.container||document.body;container.append(host);active=request
 flushSync(()=>root.render(<ContextMenu key={Date.now()} modal={false} onOpenChange={open=>{if(!open)queueMicrotask(closeMenu)}}>
  <ContextMenuTrigger asChild><span id="context-menu-anchor" aria-hidden="true" style={{position:'fixed',left:request.x,top:request.y,width:1,height:1,pointerEvents:'none'}} /></ContextMenuTrigger>
  <ContextMenuContent id="edit-menu" container={container} collisionPadding={8} className="whisper-context-menu" onCloseAutoFocus={event=>event.preventDefault()}>
   {request.items.map(item=><ContextMenuItem key={item.action} disabled={item.disabled} aria-disabled={item.disabled} data-edit={item.action} onSelect={()=>request.select(item.action)}>{item.label}</ContextMenuItem>)}
  </ContextMenuContent>
 </ContextMenu>))
 host.querySelector('#context-menu-anchor')?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:request.x,clientY:request.y,button:2}))
}
