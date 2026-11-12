import { useLayoutEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { AppShell } from './app-shell'
import './styles.css'

// Optional menus are fetched on demand, never on the first-page critical path.
let menuModule: Promise<typeof import('./components/context-menu-surface')> | undefined
let menuGeneration=0
const loadMenu=()=>menuModule??=import('./components/context-menu-surface')
document.addEventListener('whisper:menu-warm',()=>{void loadMenu().catch(()=>{menuModule=undefined})})
document.addEventListener('whisper:menu-close',()=>{menuGeneration++;void menuModule?.then(module=>module.closeMenu())})
document.addEventListener('whisper:menu-open',event=>{
 const generation=++menuGeneration
 const detail=(event as CustomEvent<Parameters<typeof import('./components/context-menu-surface').openMenu>[0]>).detail
 void loadMenu().then(module=>{if(generation===menuGeneration)module.openMenu(detail)}).catch(()=>{menuModule=undefined;detail.closed()})
})

let editorModule: Promise<typeof import('./editor')> | undefined
const loadEditor=()=>{editorModule??=import('./editor');return editorModule.then(module=>module.install()).catch(()=>{editorModule=undefined})}
document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('#insert-block'))void loadEditor().then(()=>document.dispatchEvent(new Event('whisper:insert-block')))})
document.addEventListener('focusin',event=>{if(event.target instanceof Element&&event.target.matches('#message,#rich-editor'))loadEditor()})

let started = false
function Application() {
  useLayoutEffect(() => {
    if (started) return
    started = true
    // Hydration must finish before controllers start observing or mutating islands.
    document.dispatchEvent(new Event('whisper:mounted'))
    const controller = '/app.js'
    void import(/* @vite-ignore */ controller).then(() => {
      const root = document.getElementById('root')
      if(root) root.inert = false
    }).catch(() => {
      const status = document.getElementById('status')
      if (status) status.textContent = 'Could not load Whisper. Please reload.'
    })
  }, [])
  return <AppShell />
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing application root')
// Keep the imperative composer mounted so switching modes never discards a draft.
let chatRoot:ReturnType<typeof createRoot>|undefined
let chatPanel:HTMLDivElement|undefined
let chatModule:Promise<typeof import('./chat/app')>|undefined
let chatActive=false
document.addEventListener('whisper:chat-mode',event=>{
 chatActive=(event as CustomEvent<boolean>).detail
 if(chatPanel)chatPanel.hidden=!chatActive
 if(!chatActive&&!chatRoot)return
 document.getElementById('room-mode')?.setAttribute('aria-busy',String(chatActive&&!chatRoot))
 chatModule??=import('./chat/app')
 void chatModule.then(({default:Chat})=>{
  if(!chatPanel){chatPanel=document.createElement('div');chatPanel.id='chat-panel';container.append(chatPanel);chatRoot=createRoot(chatPanel)}
  chatPanel.hidden=!chatActive
  chatRoot!.render(<Chat active={chatActive}/>)
  document.getElementById('room-mode')?.setAttribute('aria-busy','false')
 }).catch(()=>{chatModule=undefined;document.getElementById('room-mode')?.setAttribute('aria-busy','false');document.dispatchEvent(new Event('whisper:chat-error'))})
})
if(location.pathname==='/chat'||location.pathname==='/chat/')history.replaceState(null,'','/?mode=chat'+location.hash)
if (container.hasChildNodes()) hydrateRoot(container, <Application />)
else createRoot(container).render(<Application />)
