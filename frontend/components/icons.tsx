import type { ComponentProps } from 'react'

export function CloseIcon(props: ComponentProps<'svg'>) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
}
