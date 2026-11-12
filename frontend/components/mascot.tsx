import {useEffect,useRef,useState} from 'react'

export function Mascot({line,center=false}:{line?:string,center?:boolean}={}) {
  const face=useRef<HTMLButtonElement>(null)
  const [phase,setPhase]=useState('entering')
  const [replay,setReplay]=useState(0)
  useEffect(()=>{
    if(line===undefined)return
    let disposed=false;let rig:{dispose:()=>void}|undefined
    const path='/interactions.js'
    void import(/* @vite-ignore */ path).then(module=>{if(!disposed&&face.current)rig=module.watcher(face.current)})
    return()=>{disposed=true;rig?.dispose()}
  },[line===undefined])
  useEffect(()=>{
    if(line===undefined)return
    setPhase('entering')
    const hide=setTimeout(()=>setPhase('leaving'),5800)
    return()=>clearTimeout(hide)
  },[line,replay])
  if(line!==undefined)return <aside className={'share-dock chat-companion'+(center?' chat-companion-center':'')}>
    <p className="watcher-line" data-on={phase==='entering'?'':undefined} data-phase={phase} data-direction="left" aria-live="off" key={line}>
      <span className="thought-cloud"><svg className="thought-shape" viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true"><path d="M49 103C28 112 8 99 9 80C0 65 10 45 29 43C24 22 48 10 69 19C81 1 112 1 130 15C150 2 180 4 191 17C215 3 243 11 249 28C273 20 297 31 296 50C317 56 319 78 306 91C306 111 280 119 260 109C240 122 214 119 200 108C181 121 151 122 132 110C110 122 82 119 74 106C64 112 54 111 49 103Z"/></svg><span className="thought-copy">{line}</span></span>
      <span className="thought-dot thought-dot-near" aria-hidden="true"/><span className="thought-dot thought-dot-far" aria-hidden="true"/>
    </p><button className="eyt" ref={face} type="button" aria-label={line} onClick={()=>setReplay(n=>n+1)}/>
  </aside>

  return (
    <>
      <aside id="share-dock" className="share-dock">
        <p id="watcher-line" className="watcher-line" aria-live="off" />
        <div id="recording-wave" className="recording-thought" hidden>
          <div id="live-wave" className="voice-wave" aria-hidden="true" />
          <output id="recording-time">
            {"0:00"}
          </output>
        </div>
        <button id="create" className="eyt" type="button" data-i18n-aria-label="create" aria-haspopup="dialog" aria-controls="settings" />
      </aside>
    </>
  )
}
