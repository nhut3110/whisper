import { useLayoutEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { AppShell } from './app-shell'

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

// Optical renderer and camera decoder are outside the initial page bundle.
let opticalModule:Promise<typeof import('./optical/panel')>|undefined
const optical=(options:Parameters<typeof import('./optical/panel').openOptical>[0])=>{opticalModule??=import('./optical/panel');void opticalModule.then(module=>module.openOptical(options)).catch(()=>{opticalModule=undefined})}
document.addEventListener('whisper:optical',event=>optical((event as CustomEvent<Parameters<typeof import('./optical/panel').openOptical>[0]>).detail))
document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;if(event.target.closest('#scan-code'))optical({mode:'scan'});if(event.target.closest('#show-code')){const url=(document.getElementById('share-link') as HTMLInputElement)?.value;if(url)optical({mode:'share',url})}})

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
const loadChat=()=>chatModule??=import('./chat/app').catch(error=>{chatModule=undefined;throw error})
// Fetch/parse outside the first click. Never mount a hidden room or start polling.
const warmChat=()=>{if(!document.hidden)void loadChat().catch(()=>{})}
for(const event of ['pointerover','focusin','touchstart'])document.addEventListener(event,event=>{if((event.target as Element)?.closest?.('#room-mode'))warmChat()},{passive:true})
const idleChat=setTimeout(()=>{if('requestIdleCallback' in window)window.requestIdleCallback(warmChat);else warmChat()},1200)
window.addEventListener('pagehide',()=>clearTimeout(idleChat),{once:true})
document.addEventListener('whisper:chat-mode',event=>{
 chatActive=(event as CustomEvent<boolean>).detail
 if(chatPanel)chatPanel.hidden=!chatActive
 if(!chatActive&&!chatRoot)return
 document.getElementById('room-mode')?.setAttribute('aria-busy',String(chatActive&&!chatRoot))
 void loadChat().then(({default:Chat})=>{
  if(!chatPanel){chatPanel=document.createElement('div');chatPanel.id='chat-panel';container.append(chatPanel);chatRoot=createRoot(chatPanel)}
  chatPanel.hidden=!chatActive
  chatRoot!.render(<Chat active={chatActive}/>)
  document.getElementById('room-mode')?.setAttribute('aria-busy','false')
 }).catch(()=>{chatModule=undefined;document.getElementById('room-mode')?.setAttribute('aria-busy','false');document.dispatchEvent(new Event('whisper:chat-error'))})
})
if(location.pathname==='/chat'||location.pathname==='/chat/')history.replaceState(null,'','/?mode=chat'+location.hash)
if (container.hasChildNodes()) hydrateRoot(container, <Application />)
else createRoot(container).render(<Application />)
