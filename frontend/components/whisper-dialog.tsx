import type { ComponentProps } from 'react'

/** Native top-layer dialog: preserves the custom verification, PIN and mascot flows. */
export function WhisperDialog(props: ComponentProps<'dialog'>) {
  return <dialog {...props} />
}
