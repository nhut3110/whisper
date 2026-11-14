import {useCallback,type ComponentProps} from 'react'
import {DIALOG_CLOSE_MS,paperTilt,reducedDialogMotion,rememberPaperPosition} from '../dialog-motion'

/** Keep the native top layer and focus trap until the exit has finished. */
export function WhisperDialog({ref:forwardedRef,...props}:ComponentProps<'dialog'>){
 const ref=useCallback((node:HTMLDialogElement|null)=>{
  if(!node)return
  const originalShow=node.showModal,originalClose=node.close
  let timer:ReturnType<typeof setTimeout>|undefined
  const clear=()=>{clearTimeout(timer);timer=undefined}
  const finish=(value?:string)=>{clear();delete node.dataset.paperState;delete node.dataset.paperReentry;originalClose.call(node,value)}
  node.showModal=function(){
   if(this.open&&this.dataset.paperState==='closed'){rememberPaperPosition(this);this.dataset.paperReentry=''}else delete this.dataset.paperReentry
   clear();for(const [name,value] of Object.entries(paperTilt()))this.style.setProperty(name,value)
   this.dataset.paperState='open';if(!this.open)originalShow.call(this)
  }
  node.close=function(value?:string){
   if(!this.open)return
   if(reducedDialogMotion()){finish(value);return}
   if(timer)return
   rememberPaperPosition(this);this.dataset.paperState='closed';timer=setTimeout(()=>finish(value),DIALOG_CLOSE_MS)
  }
  const cancel=(event:Event)=>{event.preventDefault();node.close()}
  const closed=()=>{clear();delete node.dataset.paperState}
  node.addEventListener('cancel',cancel);node.addEventListener('close',closed)
  const cleanupRef=typeof forwardedRef==='function'?forwardedRef(node):undefined
  if(forwardedRef&&typeof forwardedRef!=='function')forwardedRef.current=node
  return()=>{clear();node.showModal=originalShow;node.close=originalClose;node.removeEventListener('cancel',cancel);node.removeEventListener('close',closed);if(typeof cleanupRef==='function')cleanupRef();else if(typeof forwardedRef==='function')forwardedRef(null);else if(forwardedRef)forwardedRef.current=null}
 },[forwardedRef])
 return <dialog data-paper-dialog ref={ref} {...props}/>
}
