import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
const choices = [['600','m10'],['3600','h1'],['86400','h24'],['604800','d7'],['custom','custom']] as const
export function ExpiryPicker() {
  const [value, setValue] = useState('86400')
  const input = useRef<HTMLInputElement>(null)
  function choose(next: string) {
    setValue(next)
    if (input.current) { input.current.value = next; input.current.dispatchEvent(new Event('change', {bubbles:true})) }
  }
  return <><Input ref={input} type="hidden" id="ttl" defaultValue="86400" /><div className="expiry-presets" role="radiogroup" aria-labelledby="expiry-label">
    {choices.map(([id,label],index) => <Button key={id} type="button" variant="ghost" role="radio" aria-checked={value===id} tabIndex={value===id?0:-1} data-expiry={id} data-i18n={id==='custom'?label:`${label}Short`} data-i18n-aria-label={label} onClick={()=>choose(id)} onKeyDown={event=>{
      const direction = document.documentElement.dir==='rtl'?-1:1
      let next = index
      if(event.key==='ArrowRight')next=(index+direction+choices.length)%choices.length
      else if(event.key==='ArrowLeft')next=(index-direction+choices.length)%choices.length
      else if(event.key==='Home')next=0
      else if(event.key==='End')next=choices.length-1
      else return
      event.preventDefault(); choose(choices[next][0]); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-expiry="${choices[next][0]}"]`)?.focus()
    }} />)}
  </div></>
}
