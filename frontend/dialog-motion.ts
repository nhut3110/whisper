/** User-supplied paper-dialog reference: transform/opacity only, no motion runtime. */
export const DIALOG_OPEN_MS=550
export const DIALOG_CLOSE_MS=650
export const reducedDialogMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches
export function paperTilt(){
 const direction=Math.random()<.5?-1:1
 return {'--paper-entry':`${(Math.random()<.5?-1:1)*(6+Math.random()*10)}deg`,'--paper-exit':`${direction*(12+Math.random()*12)}deg`,'--paper-drift':`${direction*46}px`}
}
export function rememberPaperPosition(node:HTMLElement|null){
 if(!node)return
 const style=getComputedStyle(node)
 node.style.setProperty('--paper-start',style.transform==='none'?'translate3d(0,0,0)':style.transform)
 node.style.setProperty('--paper-start-opacity',style.opacity)
}
