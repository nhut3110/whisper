import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../components/ui/dialog'
import {Button} from '../components/ui/button'
import {QrCode,Sparkles,ScanLine,Download,Link,Copy,Camera,ArrowUpRight,Check} from 'lucide-react'
import {drawQR,animateParticle,type CodeKind} from './render'
import {shareURL} from './protocol'
import {particleURL} from './particle'
import {download,exportNebula} from './export'
import './style.css'
const words={
 en:{share:'Share quietly',scan:'Scan a code',qr:'QR',particle:'Particle',experimental:'Experimental',hint:'Open Whisper’s scanner on the other device.',camera:'Open camera',cameraError:'Camera unavailable. Allow access in your browser and try again.',invalid:'This is not a valid Whisper link.',found:'Whisper link found',open:'Open',save:'Save QR',close:'Close',choose:'QR or Particle',permission:'Camera stays on this device.',waiting:'Keep the code inside the frame.'},
 vi:{share:'Gửi một lời thì thầm',scan:'Quét mã',qr:'QR',particle:'Particle',experimental:'Thử nghiệm',hint:'Mở trình quét Whisper trên thiết bị còn lại.',camera:'Mở camera',cameraError:'Chưa mở được camera. Cho phép truy cập trong trình duyệt rồi thử lại nhé.',invalid:'Đây không phải link Whisper hợp lệ.',found:'Đã tìm thấy link Whisper',open:'Mở',save:'Lưu QR',close:'Đóng',choose:'QR hoặc Particle',permission:'Hình camera chỉ xử lý trên thiết bị này.',waiting:'Giữ mã trong khung.'},
}
function CodeCanvas({canvas,kind,url,light}:{canvas:React.RefObject<HTMLCanvasElement|null>,kind:CodeKind,url:string,light:boolean}){
 useEffect(()=>{if(!canvas.current)return;if(kind==='qr'){drawQR(canvas.current,url);return}return animateParticle(canvas.current,url,{light})},[canvas,kind,url,light])
 return <canvas ref={canvas} aria-label={kind==='qr'?'Whisper QR':'Whisper Particle'}/>
}
type Options={mode:'share'|'scan',url?:string}
function Panel({options,closed}:{options:Options,closed:()=>void}){
 const [kind,setKind]=useState<CodeKind|'link'>('qr'),[progress,setProgress]=useState<number|null>(null),[copied,setCopied]=useState(false),[light,setLight]=useState(()=>document.documentElement.dataset.theme!=='dark'&&!document.documentElement.classList.contains('dark')),[error,setError]=useState(''),[found,setFound]=useState(''),[scanning,setScanning]=useState(false),[starting,setStarting]=useState(false)
 const cancelExport=useRef<()=>void>(()=>{});
 useEffect(()=>{const sync=()=>setLight(document.documentElement.dataset.theme!=='dark'&&!document.documentElement.classList.contains('dark'));const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});return()=>{observer.disconnect();cancelExport.current()}},[]);
 const canvas=useRef<HTMLCanvasElement>(null),video=useRef<HTMLVideoElement>(null),stop=useRef<()=>void>(()=>{}),alive=useRef(true)
 const lang=document.documentElement.lang.split('-')[0]==='vi'?'vi':'en',t=words[lang]
 useEffect(()=>{const visibility=()=>{if(document.hidden){stop.current();setScanning(false);setStarting(false)}};document.addEventListener('visibilitychange',visibility);return()=>{alive.current=false;stop.current();document.removeEventListener('visibilitychange',visibility)}},[])
 const close=()=>{stop.current();closed()}
 async function start(){
  if(starting||scanning)return;setError('');setFound('');setStarting(true)
  let stream:MediaStream|undefined,worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,stopped=false
  const clean=()=>{stopped=true;clearTimeout(timer);worker?.terminate();stream?.getTracks().forEach(track=>track.stop());if(video.current)video.current.srcObject=null}
  stop.current=clean
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:640}},audio:false})
   if(!alive.current||stopped){clean();return}
   const el=video.current!;el.srcObject=stream;await el.play();if(!alive.current||stopped){clean();return}
   worker=new Worker(new URL('./decoder.worker.ts',import.meta.url),{type:'module'});setScanning(true)
   const frame=document.createElement('canvas');frame.width=frame.height=480;const ctx=frame.getContext('2d',{willReadFrequently:true})!
   const next=()=>{if(stopped)return;if(document.hidden||el.readyState<2){timer=setTimeout(next,250);return}const side=Math.min(el.videoWidth,el.videoHeight);ctx.drawImage(el,(el.videoWidth-side)/2,(el.videoHeight-side)/2,side,side,0,0,480,480);const image=ctx.getImageData(0,0,480,480);worker!.postMessage({data:image.data,width:480,height:480},[image.data.buffer])}
   worker.onmessage=event=>{
    if(stopped)return
    if(event.data.value){const url=shareURL(event.data.value,location.origin)||particleURL(event.data.value,location.origin);if(url){clean();setScanning(false);setFound(url);return}setError(t.invalid)}
    timer=setTimeout(next,125)
   }
   worker.onerror=()=>{clean();if(alive.current){setScanning(false);setError(t.cameraError)}}
   next()
  }catch{clean();if(alive.current){setScanning(false);setError(t.cameraError)}}finally{if(alive.current)setStarting(false)}
 }
 function save(){canvas.current?.toBlob(blob=>{if(blob)download(blob,kind==='qr'?'whisper-qr.png':'whisper-nebula.png')})}
 function gif(){setProgress(0);cancelExport.current=exportNebula(options.url!,light,setProgress,failed=>{setProgress(null);if(failed)setError(lang==='vi'?'Chưa xuất được GIF. Thử lại nhé.':'Could not export GIF. Please try again.')})}

 return <Dialog open onOpenChange={open=>{if(!open)close()}}><DialogContent className="optical-panel" aria-describedby="optical-description"><DialogHeader><DialogTitle>{options.mode==='share'?t.share:t.scan}</DialogTitle><DialogDescription id="optical-description">{options.mode==='share'?t.hint:t.permission}</DialogDescription></DialogHeader>
  {options.mode==='share'?<>
   <div className="optical-switch" role="group" aria-label={lang==='vi'?'Cách chia sẻ':'Share format'}>{(['link','qr','particle'] as const).map(value=><Button key={value} variant="ghost" aria-pressed={kind===value} disabled={progress!==null} onClick={()=>{setKind(value);setError('')}}>{value==='link'?<Link/>:value==='qr'?<QrCode/>:<Sparkles/>}{value==='link'?'Link':value==='qr'?'QR':lang==='vi'?'Tinh vân':'Nebula'}</Button>)}</div>
   {kind==='link'?<div className="optical-link"><input readOnly aria-label="Link" value={options.url} onFocus={e=>e.currentTarget.select()}/><Button variant="ghost" onClick={()=>{void navigator.clipboard.writeText(options.url!).then(()=>setCopied(true)).catch(()=>setError(lang==='vi'?'Chưa copy được link.':'Could not copy link.'))}}>{copied?<Check/>:<Copy/>}{copied?(lang==='vi'?'Đã copy':'Copied'):'Copy'}</Button></div>:<>
    <div key={kind+light} className={'optical-art optical-'+kind} data-tone={light?'light':'dark'}><CodeCanvas canvas={canvas} kind={kind} url={options.url!} light={light}/></div>
    <div className="optical-foot"><Button variant="ghost" onClick={save} disabled={progress!==null}><Download/>PNG</Button>{kind==='particle'&&<Button variant="ghost" disabled={progress!==null} onClick={gif}><Download/>{progress===null?'GIF':`${progress}%`}</Button>}</div>
   </>}{error&&<p className="optical-error" role="alert">{error}</p>}

  </>:<>
   <div className={'optical-camera'+(found?' optical-found':'')}><video ref={video} muted playsInline aria-label={t.scan}/>{!scanning&&!starting&&<div className="optical-camera-icon">{found?<Check/>:<ScanLine/>}</div>}{scanning&&<div className="optical-guide" aria-hidden="true"/>}</div>
   <p className="optical-status" role="status">{found?t.found:scanning?t.waiting:''}</p>
   {found?<Button onClick={()=>{const url=shareURL(found,location.origin);if(url){stop.current();location.assign(url)}}}><ArrowUpRight/>{t.open}</Button>:<Button onClick={start} disabled={starting||scanning}><Camera/>{t.camera}</Button>}
   {error&&<p className="optical-error" role="alert">{error}</p>}
  </>}
 </DialogContent></Dialog>
}
let root:ReturnType<typeof createRoot>|undefined,host:HTMLDivElement|undefined,previousFocus:HTMLElement|null=null
export function openOptical(options:Options){
 if(options.mode==='share'&&(!options.url||!shareURL(options.url,location.origin)))return
 if(!host){host=document.createElement('div');host.id='optical-root';document.body.append(host);root=createRoot(host)}
 previousFocus=document.activeElement as HTMLElement|null
 root!.render(<Panel key={crypto.randomUUID()} options={options} closed={()=>{root!.render(null);previousFocus?.focus()}}/>)
}
