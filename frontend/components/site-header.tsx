import type {ReactNode} from 'react'
import {BrandMark} from './brand-mark'

/** Shared chrome for the composer and anonymous rooms. */
export function SiteHeader({children}:{children:ReactNode}) {
 return <header className="site-header"><a className="brand" href="/" aria-label="Whisper."><BrandMark className="brand-mark"/></a><div className="header-actions">{children}</div></header>
}
