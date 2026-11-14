// shadcn/ui radix-nova registry (MIT). See docs/CHAT-UI.md for provenance.
import { XIcon } from "lucide-react"
"use client"

import * as React from "react"
import {DIALOG_CLOSE_MS,paperTilt,reducedDialogMotion,rememberPaperPosition} from '../../dialog-motion'
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

const PaperContext=React.createContext<{closing:boolean;content:React.RefObject<HTMLDivElement|null>}|null>(null)
function Dialog({open:controlled,defaultOpen=false,onOpenChange,...props}:React.ComponentProps<typeof DialogPrimitive.Root>){
 const [internal,setInternal]=React.useState(defaultOpen),open=controlled??internal
 const [rendered,setRendered]=React.useState(open),[closing,setClosing]=React.useState(false)
 const content=React.useRef<HTMLDivElement>(null)
 const timer=React.useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const clear=React.useCallback(()=>{clearTimeout(timer.current);timer.current=undefined},[])
 const commit=React.useCallback((value:boolean)=>{if(controlled===undefined)setInternal(value);onOpenChange?.(value)},[controlled,onOpenChange])
 const close=React.useCallback((notify:boolean)=>{
  rememberPaperPosition(content.current);clear();setClosing(true)
  const finish=()=>{timer.current=undefined;setRendered(false);setClosing(false);if(notify)commit(false)}
  if(reducedDialogMotion())finish();else timer.current=setTimeout(finish,DIALOG_CLOSE_MS)
 },[clear,commit])
 React.useEffect(()=>{if(open){if(closing&&content.current){rememberPaperPosition(content.current);content.current.dataset.paperReentry=''}clear();setRendered(true);setClosing(false)}else if(rendered)close(false)},[open])
 React.useEffect(()=>clear,[clear])
 return <PaperContext.Provider value={{closing,content}}><DialogPrimitive.Root data-slot="dialog" open={rendered} onOpenChange={value=>{if(value){clear();setClosing(false);setRendered(true);commit(true)}else if(!closing)close(true)}} {...props}/></PaperContext.Provider>
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const paper=React.useContext(PaperContext),closing=paper?.closing??false
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay" data-paper-state={closing?"closed":"open"}
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  style,
  ref:forwardedRef,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const paper=React.useContext(PaperContext),closing=paper?.closing??false
  const [tilt]=React.useState(paperTilt)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={node=>{if(paper)paper.content.current=node;if(typeof forwardedRef==='function')return forwardedRef(node);if(forwardedRef)forwardedRef.current=node}} data-slot="dialog-content" data-paper-state={closing?"closed":"open"} style={{...tilt,...style} as React.CSSProperties}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
               />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "cn-font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
