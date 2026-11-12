import { useLayoutEffect, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

/** Small bridge for the existing message controller; only this control rerenders. */
export function OptionCheckbox({id, defaultChecked = false}: {id: string; defaultChecked?: boolean}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [value, setValue] = useState(defaultChecked)
  const notify = useRef(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const update = (event: Event) => setValue(Boolean((event as CustomEvent<boolean>).detail))
    node.addEventListener('whisper:set-option', update)
    return () => node.removeEventListener('whisper:set-option', update)
  }, [])
  useLayoutEffect(() => {
    if (!notify.current) return
    notify.current = false
    ref.current?.dispatchEvent(new Event('whisper:option-change', {bubbles: true}))
  }, [value])
  return <Checkbox ref={ref} id={id} checked={value} onCheckedChange={next => {
    notify.current = true
    setValue(next === true)
  }} />
}
