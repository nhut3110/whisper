export const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches
/** FLIP the popup's visual rectangle; avoid animating width/height every frame. */
export function morphPopover(element:HTMLElement,previous:DOMRect){
 if(reducedMotion())return
 const next=element.getBoundingClientRect()
 if(!next.width||!next.height)return
 element.animate([
  {transformOrigin:'top left',transform:`translate(${previous.left-next.left}px,${previous.top-next.top}px) scale(${previous.width/next.width},${previous.height/next.height})`,borderRadius:'24px'},
  {transformOrigin:'top left',transform:'translate(0,0) scale(1)',borderRadius:'15px'}
 ],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'})
}
