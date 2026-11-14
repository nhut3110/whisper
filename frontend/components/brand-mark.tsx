import type { ComponentProps } from 'react'
import { brand } from '@/lib/brand'
export function BrandMark(props: ComponentProps<'svg'>) {
  return <svg width="40" height="32" viewBox={brand.viewBox} aria-hidden="true" {...props}>
    <path d={brand.path} fill="none" stroke="currentColor" strokeWidth={brand.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={brand.dot.x} cy={brand.dot.y} r={brand.dot.radius} fill="currentColor" stroke="none" />
  </svg>
}
