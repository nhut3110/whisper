import {useChatNotifications} from './notifications'
import {SpoilerText} from '../components/spoiler'
import {spoilerSummary,safeCopy} from '../../web/spoiler.js'
import {EyeOff} from 'lucide-react'
import {useEffect,useMemo,useCallback,useRef,useState,type FormEvent,type ComponentProps} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Marker,MarkerContent,MarkerIcon} from '@/components/ui/marker'
import {isCaptureShortcut} from './presence'
import {Message as MessageView, MessageAvatar, MessageContent, MessageHeader, MessageFooter} from '@/components/ui/message'
import {Avatar, AvatarFallback, AvatarBadge} from '@/components/ui/avatar'
import {Tooltip, TooltipProvider, TooltipTrigger, TooltipContent} from '@/components/ui/tooltip'
import {Bubble, BubbleContent, BubbleReactions} from '@/components/ui/bubble'
import {Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentTrigger} from '@/components/ui/attachment'
import {InputGroup, InputGroupAddon, InputGroupButton} from '@/components/ui/input-group'
import {MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton} from '@/components/ui/message-scroller'
import {DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator} from '@/components/ui/dropdown-menu'
import {Popover, PopoverTrigger, PopoverContent, PopoverClose} from '@/components/ui/popover'
import {Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from '@/components/ui/dialog'
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select'
import {Bell,BellOff,QrCode, LockKeyhole, Camera, UserPlus, UserMinus, ArrowDown, ArrowLeft, ArrowUp, Download, FileImage, FileSpreadsheet, Check, CheckCheck, Clock3, Copy, FileText, Link2, LogOut, MessageCircle, MoreHorizontal, Paperclip, Pencil, Reply, SmilePlus, SlidersHorizontal, Trash2, Users, X} from 'lucide-react'
import {Label} from '@/components/ui/label'
import {Mascot} from '@/components/mascot'
import {decrypt,encrypt,parseInvite,parseContent,random,safeURL,validFile,type FileInfo} from './crypto'
import {words,type Lang} from './locale'
import {EmojiGlyph,EmojiText} from './emoji'
import {emojiOnlyCount} from './emoji/content'
import {EmojiMenu} from './emoji/menu'
import {LinkPreview,type PreviewData} from './link-preview'
import {EmojiComposer,type ComposerHandle} from './emoji/composer'
import './chat.css'

type Session={id:string,access:string,key:string,member:string,name:string,joined:boolean}
type Person={id:string,name:string,host:boolean,seen:number,online:boolean,typing:boolean,focused?:boolean}
type RoomEvent={id:string,member:string,name:string,kind:'joined'|'left'|'capture_shortcut'|'copied'|'downloaded',at:string,seq?:number|null}
type Item={seq:number,sender:string,ciphertext:string,iv:string,reply:number|null,sent_at:string,edited:boolean,reactions:{emoji:string,member:string}[]}
type Content={text:string,file?:FileInfo}
type Message=Item&{content:Content,pending?:boolean}
type State={me:string,expires_at:string,max_members:number,max_messages:number,mode:'total'|'rolling',keep:number,sent:number,members:Person[],messages:Message[],events?:RoomEvent[]}
type Modal={kind:'link',url:string}|{kind:'destroy'|'leave'|'file',seq?:number}
const encoder=new TextEncoder();
const store='whisper-chat-session';
function initial():{session:Session|null,error?:string}{
 try{
  const saved=JSON.parse(sessionStorage.getItem(store)||'null') as Session|null;
  if(location.hash.startsWith('#r=')){const invite=parseInvite(location.hash);return {session:saved?.id===invite.id?{...saved,...invite}:{...invite,member:random(),name:'',joined:false}}}
  return {session:saved};
 }catch{return {session:null,error:location.hash?'invalid':undefined}}
}
function ParticipantAvatar({name,id,person,lang='en',presence=false}:{name:string,id:string,person?:Person,lang?:Lang,presence?:boolean}){
 const tone=Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)%5;
 const status=!person?'left':!person.online?'offline':person.focused===false?'away':'online';
 const label=words[lang][status];
 return <Avatar size="sm" className={'chat-participant-avatar chat-avatar-tone-'+tone} role="img" aria-label={name+(presence?' · '+label:'')} title={presence?label:undefined}><AvatarFallback>{name.slice(0,1).toLocaleUpperCase()}</AvatarFallback>{presence&&<AvatarBadge className="chat-presence" data-presence={status}><span className="sr-only">{label}</span></AvatarBadge>}</Avatar>
}
function MessageFrame({children,...props}:ComponentProps<typeof MessageView>){
 const [expanded,setExpanded]=useState(false);
 const press=useRef<{x:number,y:number,at:number}|null>(null);
 return <MessageView {...props} data-time-open={expanded}
  onPointerDown={e=>{press.current=e.pointerType==='touch'||e.pointerType==='pen'?{x:e.clientX,y:e.clientY,at:Date.now()}:null}}
  onPointerUp={e=>{
   const start=press.current;press.current=null;
   if(!start||Date.now()-start.at>600||Math.hypot(e.clientX-start.x,e.clientY-start.y)>8||window.getSelection()?.isCollapsed===false)return;
   const target=e.target as HTMLElement;
   if(!target.closest('[data-slot=bubble-content]')||target.closest('button,a,input,[role=button]'))return;
   setExpanded(v=>!v);
  }} onPointerCancel={()=>{press.current=null}}
  onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&(e.target as HTMLElement).dataset.slot==='bubble'){e.preventDefault();setExpanded(v=>!v)}}}
 >{children}</MessageView>
}
class APIError extends Error {code:string;status:number;constructor(code:string,status:number){super(code);this.code=code;this.status=status}}
async function request(session:Session,action:string,data:Record<string,unknown>={}){
 const r=await fetch(action==='create'?'/api/rooms':`/api/rooms/${session.id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({member:session.member,...data}),keepalive:action==='presence',signal:AbortSignal.timeout(12000)});
 const result=await r.json();if(!r.ok)throw new APIError(result.code||'network',r.status);return result;
}
function VisibleText({text,open}:{text:string,open:(url:string)=>void}){
 const parts=text.split(/(https?:\/\/[^\s<>]+)/g);
 return <>{parts.map((part,i)=>{const url=safeURL(part);return url?<button className="chat-text-link" key={i} onClick={()=>open(url.href)}>{part}</button>:<span key={i}><EmojiText text={part}/></span>})}</>
}
function TextContent({text,open}:{text:string,open:(url:string)=>void}){return <SpoilerText text={text} render={part=><VisibleText text={part} open={open}/>}/>}
export default function Chat({active=true}:{active?:boolean}={}){
 const [boot]=useState(initial);const [session,setSession]=useState<Session|null>(boot.session);
 const [lang,setLang]=useState<Lang>(()=>{try{const v=localStorage.getItem('whisper-language');return v==='vi'||(!v||v==='auto')&&navigator.language.startsWith('vi')?'vi':'en'}catch{return 'en'}});
 useEffect(()=>{const update=()=>{const value=localStorage.getItem('whisper-language');setLang(value==='vi'||(!value||value==='auto')&&navigator.language.startsWith('vi')?'vi':'en')};window.addEventListener('whisper-languagechange',update);return()=>window.removeEventListener('whisper-languagechange',update)},[]);
 const t=words[lang];const [error,setError]=useState(boot.error||'');const [notice,setNotice]=useState('');
 const [state,setState]=useState<State|null>(null);const [name,setName]=useState(session?.name||'');const [ttl,setTtl]=useState(24);const [count,setCount]=useState(4);const [mode,setMode]=useState('total');const [limit,setLimit]=useState(100);const [keep,setKeep]=useState(50);
 const [text,setText]=useState('');const [reply,setReply]=useState<Message|null>(null);const [edit,setEdit]=useState<Message|null>(null);const [file,setFile]=useState<{info:FileInfo,bytes:Uint8Array}|null>(null);
 const [busy,setBusy]=useState(false);const [gone,setGone]=useState(false);const [modal,setModal]=useState<Modal|null>(null);const [now,setNow]=useState(Date.now());const [pulse,setPulse]=useState(0);
 const notifications=useChatNotifications({room:session?.joined&&!gone?session.id:undefined,me:state?.me,messages:state?.messages,active,label:t.newMessages});
 const lastSnapshot=useRef('');
 const authoritative=useRef<State|null>(null);
 const optimistic=useRef(new Map<string,(state:State)=>State>());
 const actionLocks=useRef(new Set<number>());
 const syncTask=useRef<Promise<void>|null>(null);
 const paint=()=>{let next=authoritative.current;for(const apply of optimistic.current.values())if(next)next=apply(next);setState(next)};
 const previewCache=useRef(new Map<string,Promise<PreviewData>>());
 useEffect(()=>{if(gone)previewCache.current.clear();return()=>previewCache.current.clear()},[session?.id,gone]);
 const loadPreview=useCallback((url:string)=>{if(!session||gone)return Promise.resolve({});let pending=previewCache.current.get(url);if(!pending){pending=request(session,'preview',{url}).catch(()=>({}));if(previewCache.current.size>=8)previewCache.current.delete(previewCache.current.keys().next().value!);previewCache.current.set(url,pending)}return pending},[session?.id,session?.member,gone]);
 const emojiCounts=useRef(new WeakMap<Content,number>());const cache=useRef(new Map<number,{fingerprint:string,content:Content}>());const typing=useRef(0);const seen=useRef(0);const log=useRef<HTMLDivElement>(null);const compose=useRef<ComposerHandle>(null);const upload=useRef<HTMLInputElement>(null);const pendingSend=useRef<{body:string,reply:number|null,bytes:Uint8Array|undefined,nonce:string}|null>(null);const syncing=useRef(false);const live=useRef(true);const generation=useRef(0);
 useEffect(()=>{if(active)document.body.classList.add('chat-page');if(active)document.documentElement.lang=lang;const timer=setInterval(()=>setNow(Date.now()),30000);return()=>{clearInterval(timer);document.body.classList.remove('chat-page')}},[lang,active]);
 useEffect(()=>{live.current=true;return()=>{live.current=false;optimistic.current.clear();authoritative.current=null;pendingSend.current=null}},[]);
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(id)},[notice]);
 const persist=(s:Session)=>{sessionStorage.setItem(store,JSON.stringify(s));history.replaceState(null,'','/?mode=chat');setSession(s)};
 const fail=(e:unknown)=>{const code=e instanceof APIError?e.code:'network';if(code==='roomGone'){generation.current++;pendingSend.current=null;optimistic.current.clear();authoritative.current=null;setGone(true);cache.current.clear();setState(null);setText('');setFile(null);setReply(null);setEdit(null);setModal(null);sessionStorage.removeItem(store)}else setError(code)};
 const sync=async(s:Session,fresh=false):Promise<void>=>{
  if(syncTask.current){await syncTask.current;if(fresh)return sync(s);return;}
  const task=syncOnce(s);syncTask.current=task;try{await task}finally{if(syncTask.current===task)syncTask.current=null}
 };
 const syncOnce=async(s:Session)=>{
  if(syncing.current||!live.current)return;
  syncing.current=true;const revision=generation.current;
  try{
   const r=await request(s,'sync',{seen:seen.current,typing:active&&Date.now()-typing.current<5000,focused:active&&!document.hidden&&document.hasFocus()}) as State;
   const snapshot=JSON.stringify(r);if(lastSnapshot.current===snapshot){setError('');return;}
   const before=log.current;const nearBottom=!before||before.scrollHeight-before.scrollTop-before.clientHeight<100;
   const messages=await Promise.all(r.messages.map(async item=>{
    const fingerprint=item.iv+item.ciphertext;let content=cache.current.get(item.seq)?.fingerprint===fingerprint?cache.current.get(item.seq)!.content:undefined;
    if(!content){try{content=parseContent(await decrypt(item.ciphertext,item.iv,s.key,s.id));}catch{content={text:'[Cannot decrypt this message]'}}cache.current.set(item.seq,{fingerprint,content})}
    return {...item,content};
   }));
   if(!live.current||revision!==generation.current)return;
   const retained=new Set(messages.map(m=>m.seq));for(const n of cache.current.keys())if(!retained.has(n))cache.current.delete(n);
   lastSnapshot.current=snapshot;authoritative.current={...r,messages};paint();setError('');
   if(nearBottom&&active&&!document.hidden&&document.hasFocus())seen.current=r.sent;
  }catch(e){if(live.current)fail(e)}finally{syncing.current=false}
 };
 useEffect(()=>{
  if(!session?.joined||gone)return;
  let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{if(stopped)return;await sync(session);if(!stopped)timer=setTimeout(poll,document.hidden?15000:active?3000:10000)};void poll();
  const visible=()=>{if(!document.hidden){clearTimeout(timer);void poll()}};document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible)};
 // Session identity is stable until join/leave; keep timers independent of typing renders.
 },[session?.id,session?.joined,gone,pulse,active]);
 // Best-effort presence: switching tabs never emits a leave notice.
 useEffect(()=>{
  if(!session?.joined||gone)return;
  let queue=Promise.resolve();let lastCapture=0;let disposed=false;
  const report=(focused:boolean)=>{queue=queue.catch(()=>{}).then(async()=>{if(!disposed)await request(session,'presence',{focused})}).catch(()=>{})};
  const focus=()=>report(active&&!document.hidden&&document.hasFocus());
  const hide=()=>{void request(session,'presence',{focused:false}).catch(()=>{})};
  const shortcut=(event:KeyboardEvent)=>{
   if(!active||document.hidden||!isCaptureShortcut(event)||Date.now()-lastCapture<30000)return;
   lastCapture=Date.now();
   void request(session,'capture',{focused:document.hasFocus()}).then(()=>{if(!disposed)void sync(session,true)}).catch(()=>{});
  };
  focus();window.addEventListener('focus',focus);window.addEventListener('blur',focus);
  document.addEventListener('visibilitychange',focus);window.addEventListener('pagehide',hide);window.addEventListener('keydown',shortcut,true);window.addEventListener('keyup',shortcut,true);
  return()=>{disposed=true;window.removeEventListener('focus',focus);window.removeEventListener('blur',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('pagehide',hide);window.removeEventListener('keydown',shortcut,true);window.removeEventListener('keyup',shortcut,true);void request(session,'presence',{focused:false}).catch(()=>{})};
 },[session?.id,session?.joined,gone,active]);
 // Only IDs leave the browser; copied plaintext and clipboard contents never do.
 const copiedRecently=useRef<{seq:number|null,at:number}|null>(null);
 const reportCopy=useCallback((seq:number|null)=>{
  if(!session?.joined||gone||!active)return;
  const last=copiedRecently.current;if(last?.seq===seq&&Date.now()-last.at<1000)return;
  copiedRecently.current={seq,at:Date.now()};
  void request(session,'copy',{seq}).then(()=>{if(live.current)void sync(session,true)}).catch(()=>{});
 },[session?.id,session?.joined,gone,active]);
 useEffect(()=>{
  if(!session?.joined||gone||!active)return;
  const fromRange=(range?:Range)=>{
   if(!range||range.collapsed||!log.current)return;
   const rows=Array.from(log.current.querySelectorAll<HTMLElement>('.chat-message')).filter(row=>{
    const bubble=row.querySelector('[data-slot=bubble-content]');return bubble&&range.intersectsNode(bubble);
   });
   if(!rows.length)return;
   const seq=rows.length===1?Number(rows[0].dataset.seq):null;
   if(seq!==null&&seq<1)return;reportCopy(seq);
  };
  const nativeCopy=(event:ClipboardEvent)=>{if(!event.isTrusted)return;const selection=getSelection();if(selection?.rangeCount)fromRange(selection.getRangeAt(0))};
  const menuCopy=(event:Event)=>fromRange((event as CustomEvent<{range?:Range}>).detail?.range);
  document.addEventListener('copy',nativeCopy);document.addEventListener('whisper:menu-copied',menuCopy);
  return()=>{document.removeEventListener('copy',nativeCopy);document.removeEventListener('whisper:menu-copied',menuCopy)};
 },[session?.id,session?.joined,gone,active,reportCopy]);
 useEffect(()=>{if(!state||gone)return;const timer=setTimeout(()=>{generation.current++;pendingSend.current=null;optimistic.current.clear();authoritative.current=null;setGone(true);setState(null);setText('');setFile(null);setReply(null);setEdit(null);setModal(null);cache.current.clear();sessionStorage.removeItem(store)},Math.max(0,Date.parse(state.expires_at)-Date.now()));return()=>clearTimeout(timer)},[state?.expires_at,gone]);
 async function enter(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  const s:Session=session||{id:random(),key:random(),access:random(),member:random(),name:'',joined:false};s.name=name.trim()||`Guest ${Math.floor(Math.random()*900)+100}`;
  try{
   sessionStorage.setItem(store,JSON.stringify({...s,joined:false}));
   if(session)await request(s,'join',{access:s.access,name:s.name});
   else await request(s,'create',{id:s.id,access:s.access,name:s.name,ttl:ttl*3600,max_members:count,max_messages:limit,mode,keep});
   persist({...s,joined:true});setNotice(t.ready);
  }catch(e){fail(e)}finally{setBusy(false)}
 }
 async function send(e:FormEvent){
  e.preventDefault();if(!session||busy||!state||(!text.trim()&&!file))return;if(text.length>4000){setError('msgLimit');return}setBusy(true);setError('');
  const content:Content={text:text.trim(),...(file?{file:file.info}:edit?.content.file?{file:edit.content.file}:{})};
  const serialized=JSON.stringify(content),editing=edit,replying=reply,attached=file,draft=text;
  if(!editing&&(!pendingSend.current||pendingSend.current.body!==serialized||pendingSend.current.reply!==(replying?.seq??null)||pendingSend.current.bytes!==attached?.bytes))pendingSend.current={body:serialized,reply:replying?.seq??null,bytes:attached?.bytes,nonce:crypto.randomUUID().replaceAll('-','')};
  const id=editing?'edit:'+editing.seq:'send:'+pendingSend.current!.nonce;
  const temp=-(Date.now());
  const item:Message={seq:temp,sender:state.me,ciphertext:'',iv:'',reply:replying?.seq??null,sent_at:new Date().toISOString(),edited:false,reactions:[],content,pending:true};
  optimistic.current.set(id,current=>({...current,messages:editing?current.messages.map(m=>m.seq===editing.seq?{...m,content,edited:true,pending:true}:m):current.messages.some(m=>item.ciphertext&&m.ciphertext===item.ciphertext)?current.messages:[...current.messages,item]}));paint();
  setText('');setFile(null);setEdit(null);setReply(null);typing.current=0;compose.current?.focus();
  try{
   const encrypted=await encrypt(encoder.encode(serialized),session.key,session.id);
   Object.assign(item,encrypted);
   const attachment=attached?await encrypt(attached.bytes,session.key,session.id,'file'):null;
   const result=await request(session,editing?'edit':'send',{...encrypted,...(editing?{seq:editing.seq}:{nonce:pendingSend.current!.nonce,reply:replying?.seq??null,file:attachment?.ciphertext??null,file_iv:attachment?.iv??null})});
   // Commit the acknowledged item locally, without waiting for another network trip.
   generation.current++;lastSnapshot.current='';
   const base=authoritative.current;
   if(base){const acknowledged={...item,...encrypted,sent_at:editing?.sent_at??item.sent_at,reactions:editing?.reactions??item.reactions,seq:result.seq??editing?.seq??temp,pending:false,edited:!!editing};
    authoritative.current={...base,sent:editing?base.sent:Math.max(base.sent,acknowledged.seq),messages:editing?base.messages.map(m=>m.seq===editing.seq?acknowledged:m):base.messages.some(m=>m.seq===acknowledged.seq)?base.messages:[...base.messages,acknowledged]};}
   pendingSend.current=null;optimistic.current.delete(id);paint();void sync(session,true);
  }catch(e){optimistic.current.delete(id);paint();if(!(e instanceof APIError&&e.code==='roomGone')){setText(current=>current&&draft?draft+'\n'+current:current||draft);setFile(current=>current||attached);setEdit(current=>current||editing);setReply(current=>current||replying)}fail(e)}finally{setBusy(false)}
 }
 async function action(kind:string,data:Record<string,unknown>){
  if(!session||!state)return;const seq=Number(data.seq);if(actionLocks.current.has(seq))return;actionLocks.current.add(seq);setError('');
  const id=kind+':'+seq;
  const emoji=String(data.emoji),remove=state.messages.find(m=>m.seq===seq)?.reactions.some(r=>r.member===state.me&&r.emoji===emoji);
  const apply=(current:State):State=>({...current,messages:kind==='delete'?current.messages.filter(m=>m.seq!==seq):current.messages.map(m=>{if(m.seq!==seq)return m;return {...m,reactions:remove?m.reactions.filter(r=>!(r.member===current.me&&r.emoji===emoji)):[...m.reactions.filter(r=>!(r.member===current.me&&r.emoji===emoji)),{member:current.me,emoji}]}})});
  optimistic.current.set(id,apply);paint();
  try{await request(session,kind,data);generation.current++;lastSnapshot.current='';if(authoritative.current)authoritative.current=apply(authoritative.current);optimistic.current.delete(id);paint();void sync(session,true)}catch(e){optimistic.current.delete(id);paint();fail(e)}finally{actionLocks.current.delete(seq)}
 }
 async function attachment(seq:number){
  if(!session||!state)return;setBusy(true);
  try{
   const message=state.messages.find(m=>m.seq===seq);const meta=message?.content.file;if(!meta||typeof meta.name!=='string')throw Error();
   const r=await request(session,'file',{seq});if(!r.file)throw new APIError('messageGone',404);
   const bytes=await decrypt(r.file,r.iv,session.key,session.id,'file');const mime=validFile(meta.name,bytes);if(!mime||meta.size!==bytes.length)throw new APIError('fileError',400);
   const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=meta.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,120);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setModal(null);void sync(session,true);
  }catch(e){fail(e)}finally{setBusy(false)}
 }
 async function confirm(){
  if(!session||!modal)return;
  if(modal.kind==='link'){window.open(modal.url,'_blank','noopener,noreferrer');setModal(null);return}
  if(modal.kind==='file'){await attachment(modal.seq!);return}
  setBusy(true);try{await request(session,modal.kind);generation.current++;pendingSend.current=null;optimistic.current.clear();authoritative.current=null;sessionStorage.removeItem(store);cache.current.clear();setState(null);setSession(null);setGone(true);setText('');setFile(null);setModal(null)}catch(e){fail(e)}finally{setBusy(false)}
 }
 const errorText=error?(t[({roomFull:'full',roomGone:'gone'} as Record<string,string>)[error] as keyof typeof t]||t[error as keyof typeof t]||t.network):'';
 const self=state?.members.find(m=>m.id===state.me);const locked=state?.mode==='total'&&state.sent>=state.max_messages;
 const expires=state?new Date(state.expires_at).toLocaleString(lang):'';
 const remain=state?Math.max(0,Math.ceil((Date.parse(state.expires_at)-Math.max(now,Date.now()))/60000)):0;
 const invite=async()=>{if(!session)return;try{await navigator.clipboard.writeText(`${location.origin}/?mode=chat#r=${session.id}&a=${session.access}&k=${session.key}`);setNotice(t.copied)}catch{setError('network')}};
 const link=(url:string)=>setModal({kind:'link',url});
 // The scroller owns position. Message content is memoized independently of composer typing.
 const renderedMessages=useMemo(()=>state?.messages.map((m,index)=>{
  const mine=m.sender===state.me;
  const person=state.members.find(p=>p.id===m.sender);
  const original=state.messages.find(p=>p.seq===m.reply);
  const previous=state.messages[index-1];
  const hasEvent=(from:string,to:string)=>state.events?.some(e=>Date.parse(e.at)>Date.parse(from)&&Date.parse(e.at)<=Date.parse(to));
  const grouped=previous?.sender===m.sender&&Date.parse(m.sent_at)-Date.parse(previous.sent_at)<120000&&!hasEvent(previous.sent_at,m.sent_at);
  const next=state.messages[index+1];
  const groupEnd=!next||next.sender!==m.sender||Date.parse(next.sent_at)-Date.parse(m.sent_at)>=120000||hasEvent(m.sent_at,next.sent_at);
  const counts=Array.from(new Set(m.reactions.map(r=>r.emoji))).map(emoji=>({emoji,total:m.reactions.filter(r=>r.emoji===emoji).length,mine:m.reactions.some(r=>r.emoji===emoji&&r.member===state.me)})).filter(r=>r.total);
  let emojiCount=emojiCounts.current.get(m.content);
  if(emojiCount===undefined){emojiCount=m.content.file?0:emojiOnlyCount(m.content.text);emojiCounts.current.set(m.content,emojiCount)}
  const sender=mine?t.you:person?.name||state.events?.find(e=>e.member===m.sender)?.name||'Guest';
  const urls=Array.from(new Set(spoilerSummary(m.content.text).match(/https?:\/\/[^\s<>]+/g)||[])).map(safeURL).filter((url):url is URL=>!!url).slice(0,2);
  const linkOnly=urls.length===1&&/^https?:\/\/[^\s<>]+$/.test(m.content.text.trim())&&!m.content.file;
  const fileOnly=!!m.content.file&&!m.content.text.trim();
  return <MessageScrollerItem key={m.seq} messageId={String(m.seq)} className={grouped?'chat-row chat-row-grouped':'chat-row'}>
   <MessageFrame align={mine?'end':'start'} data-seq={m.seq} data-pending={m.pending||undefined} data-group-start={!grouped} data-group-end={groupEnd} className={'chat-message'+(mine?' chat-mine':'')}>
    <MessageContent>
     {!mine&&!grouped&&<MessageHeader>{sender}</MessageHeader>}
     {m.reply&&<div className="chat-reply-context"><small><Reply/>{sender} · {t.reply}</small><button className="chat-reply-quote" onClick={()=>document.querySelector(`[data-seq="${m.reply}"]`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}><EmojiText text={(original?spoilerSummary(original.content.text).slice(0,120):'')||original?.content.file?.name||t.replyGone}/></button></div>}
     <div className="chat-bubble-row">
     {!mine&&<MessageAvatar className={'chat-avatar group-has-data-[slot=message-footer]/message:translate-y-0'+(!groupEnd?' chat-avatar-continuation':'')} aria-hidden={!groupEnd}><ParticipantAvatar name={sender} id={m.sender} person={person} lang={lang} presence/></MessageAvatar>}
     <Bubble variant={mine?'default':'secondary'} align={mine?'end':'start'} data-emoji-count={emojiCount||undefined} className={[counts.length?'chat-has-reactions':'',emojiCount?'chat-emoji-only':'',linkOnly?'chat-link-only':'',fileOnly?'chat-file-only':''].filter(Boolean).join(' ')} tabIndex={0} aria-label={sender}>
      <Tooltip><TooltipTrigger asChild data-slot="bubble-content"><BubbleContent tabIndex={0}>

       {!!m.content.text&&!linkOnly&&<div className="chat-message-text"><TextContent text={m.content.text} open={link}/></div>}
       {m.content.file&&<Attachment className="chat-attachment" size="sm">
        <AttachmentMedia>{m.content.file.type.startsWith('image/')?<FileImage/>:m.content.file.type==='text/csv'?<FileSpreadsheet/>:<FileText/>}</AttachmentMedia><AttachmentContent><AttachmentTitle title={m.content.file.name}>{m.content.file.name}</AttachmentTitle><AttachmentDescription>{m.content.file.name.split('.').pop()?.toUpperCase()} · {m.content.file.size<1024?`${m.content.file.size} B`:`${Math.ceil(m.content.file.size/1024)} KB`}</AttachmentDescription></AttachmentContent><Download className="chat-file-download" aria-hidden="true"/>
        <AttachmentTrigger aria-label={t.download+': '+m.content.file.name} onClick={()=>setModal({kind:'file',seq:m.seq})}/>
       </Attachment>}
       {!!urls.length&&<div className={linkOnly?'chat-message-text':'chat-link-previews'}>{urls.map(url=><LinkPreview key={url.href} url={url} open={link} standalone={linkOnly} load={loadPreview}/>)}</div>}
      </BubbleContent></TooltipTrigger><TooltipContent showArrow={false} className="chat-time-tooltip" side="top" sideOffset={7}>{new Date(m.sent_at).toLocaleString(lang,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}{m.edited?' · '+t.edited:''}</TooltipContent></Tooltip>
      {!!counts.length&&<BubbleReactions className="chat-reactions translate-y-0" align="end"><Popover><PopoverTrigger asChild><button aria-label={counts.map(r=>r.emoji+' '+r.total).join(', ')} aria-pressed={counts.some(r=>r.mine)}><span className="chat-reaction-icons" key={counts.map(r=>r.emoji+':'+r.total).join('|')}>{counts.slice(0,3).map(r=><span key={r.emoji}><EmojiGlyph value={r.emoji}/></span>)}</span>{m.reactions.length>1&&<span className="chat-reaction-count">{m.reactions.length}</span>}</button></PopoverTrigger><PopoverContent className="chat-reaction-people" align="end" side="top"><h2>{t.reactions}<span>{m.reactions.length}</span></h2>{m.reactions.map(r=>{const member=state.members.find(p=>p.id===r.member);return <div className="chat-reaction-person" key={r.member+'-'+r.emoji}><ParticipantAvatar name={member?.name||'Guest'} id={r.member}/><span>{r.member===state.me?t.you:member?.name||'Guest'}</span>{r.member===state.me?<PopoverClose asChild><Button variant="ghost" size="icon-sm" aria-label={t.removeReaction} onClick={()=>void action('react',{seq:m.seq,emoji:r.emoji})}><EmojiGlyph value={r.emoji}/></Button></PopoverClose>:<span><EmojiGlyph value={r.emoji}/></span>}</div>})}</PopoverContent></Popover></BubbleReactions>}
     </Bubble>

    <div className="chat-message-actions" inert={m.pending||undefined}>
     <EmojiMenu lang={lang} quick align={mine?'end':'start'} onSelect={emoji=>void action('react',{seq:m.seq,emoji})}><Button className="chat-react-picker" variant="ghost" size="icon-sm" aria-label={t.react}><SmilePlus/></Button></EmojiMenu>
     <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t.actions}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align={mine?'end':'start'}>
      <DropdownMenuItem onSelect={()=>{setReply(m);setEdit(null);setTimeout(()=>compose.current?.focus(),0)}}><Reply/>{t.reply}</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>{void navigator.clipboard.writeText(safeCopy(document.querySelector(`[data-seq="${m.seq}"] .chat-message-text`) as HTMLElement||document.createElement('div')).text).then(()=>{setNotice(t.messageCopied);reportCopy(m.seq)}).catch(()=>setError('network'))}} disabled={!m.content.text}><Copy/>{t.copy}</DropdownMenuItem>
      {mine&&<><DropdownMenuSeparator/><DropdownMenuItem onSelect={()=>{setEdit(m);setText(m.content.text);setReply(null);setFile(null);setTimeout(()=>compose.current?.focus(),0)}}><Pencil/>{t.edit}</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={()=>void action('delete',{seq:m.seq})}><Trash2/>{t.delete}</DropdownMenuItem></>}
     </DropdownMenuContent></DropdownMenu>
    </div>
     </div>
     <MessageFooter className="chat-message-footer">
      <time className="chat-message-time" dateTime={m.sent_at}>{new Date(m.sent_at).toLocaleTimeString(lang,{hour:'2-digit',minute:'2-digit'})}</time>
      {m.edited&&<span className="chat-message-time">{t.edited}</span>}
      {mine&&groupEnd&&<span className="chat-receipt" title={m.pending?'…':state.members.some(p=>p.id!==state.me&&p.seen>=m.seq)?t.seen:t.sent}>{m.pending?<Clock3/>:state.members.some(p=>p.id!==state.me&&p.seen>=m.seq)?<CheckCheck/>:<Check/>}<span className="sr-only">{state.members.some(p=>p.id!==state.me&&p.seen>=m.seq)?t.seen:t.sent}</span></span>}
     </MessageFooter>
    </MessageContent>

   </MessageFrame>
  </MessageScrollerItem>
 }),[state,lang,session?.id,loadPreview,reportCopy]);
 const timeline=useMemo(()=>[
  ...(state?.messages.map((m,index)=>({at:m.sent_at,node:renderedMessages?.[index]}))||[]),
  ...(state?.events?.map(event=>({at:event.at,node:<MessageScrollerItem key={'event:'+event.id} messageId={'event:'+event.id} className="chat-checkpoint-row"><Marker variant="separator" className="chat-checkpoint" data-event={event.kind}><MarkerContent><MarkerIcon>{event.kind==='joined'?<UserPlus/>:event.kind==='left'?<UserMinus/>:event.kind==='copied'?<Copy/>:event.kind==='downloaded'?<Download/>:<Camera/>}</MarkerIcon><span>{event.member===state.me?t.you:event.name} {t[event.kind==='left'?'leftEvent':event.kind==='copied'?'copyEvent':event.kind]}{(event.kind==='copied'||event.kind==='downloaded')&&event.seq&&<> <Button variant="link" size="sm" className="chat-checkpoint-target" title={event.kind==='downloaded'?state.messages.find(m=>m.seq===event.seq)?.content.file?.name:state.messages.find(m=>m.seq===event.seq)?.content.text ? spoilerSummary(state.messages.find(m=>m.seq===event.seq)!.content.text).slice(0,90):undefined} disabled={!state.messages.some(m=>m.seq===event.seq)} onClick={()=>document.querySelector(`[data-seq="${event.seq}"]`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}>{event.kind==='downloaded'?(state.messages.find(m=>m.seq===event.seq)?.content.file?.name||`#${event.seq}`):`#${event.seq}`}</Button></>}</span>{event.kind==='copied'&&<span className="chat-checkpoint-private" title={t.hostOnly} aria-label={t.hostOnly}><LockKeyhole/></span>}<span className="sr-only"> · {new Date(event.at).toLocaleString(lang)}</span></MarkerContent></Marker></MessageScrollerItem>}))||[])
 ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(item=>item.node),[state?.messages,state?.events,renderedMessages,lang]);


 return <TooltipProvider delayDuration={220} disableHoverableContent><div className="chat-app">
  {gone?<main className="chat-ended"><Mascot line={t.gone} center/><Button asChild variant="ghost"><a href="/?mode=chat">{t.back}<ArrowLeft/></a></Button></main>:!session?.joined?<main className="chat-lobby"><section className="chat-note"><h1>{session?t.join:t.title}</h1><form onSubmit={enter}>
   <div className="chat-field"><Label htmlFor="chat-name">{t.name}</Label><Input id="chat-name" value={name} onChange={e=>setName(e.target.value)} maxLength={32} autoComplete="off" placeholder="Guest"/></div>
   {!session&&<><div className="chat-form-grid"><div className="chat-field"><Label htmlFor="chat-ttl"><Clock3/>{t.hours}</Label><NativeSelect id="chat-ttl" value={ttl} onChange={e=>setTtl(+e.target.value)}>{[1,6,24,48].map(n=><NativeSelectOption key={n} value={String(n)}>{n} h</NativeSelectOption>)}</NativeSelect></div><div className="chat-field"><Label htmlFor="chat-count"><Users/>{t.people}</Label><NativeSelect id="chat-count" value={count} onChange={e=>setCount(+e.target.value)}>{[2,3,4,6,8,12].map(n=><NativeSelectOption key={n} value={String(n)}>{n}</NativeSelectOption>)}</NativeSelect></div></div>
   <details className="chat-more-settings"><summary><SlidersHorizontal/>{t.options}</summary><div className="chat-settings-fields"><div className="chat-field"><Label htmlFor="chat-mode">{t.mode}</Label><NativeSelect id="chat-mode" value={mode} onChange={e=>setMode(e.target.value)}><NativeSelectOption value="total">{t.total}</NativeSelectOption><NativeSelectOption value="rolling">{t.rolling}</NativeSelectOption></NativeSelect></div>
   <div className="chat-limit-field"><Label htmlFor="chat-limit">{mode==='total'?t.limit:t.keep}</Label><Input id="chat-limit" type="number" min={mode==='total'?10:1} max={mode==='total'?1000:200} value={mode==='total'?limit:keep} onChange={e=>mode==='total'?setLimit(+e.target.value):setKeep(+e.target.value)}/></div></div></details></>}
   {error&&<p role="alert" className="chat-error">{errorText}</p>}<Button type="submit" className="chat-primary" disabled={busy}>{busy?'…':session?t.join:t.create}<ArrowUp/></Button>
  </form></section><Mascot line={t.welcome}/></main>:<main className="chat-room">
   <div className="chat-room-bar"><div className="chat-room-summary"><span className="chat-live-dot"/><span>{state?.members.length||1}/{state?.max_members||count}</span><span className="chat-muted" title={expires}><Clock3/><span className="sr-only">{t.expires}: </span>{remain>=60?`${Math.floor(remain/60)} h${remain%60?' '+remain%60+' min':''}`:`${remain} min`}</span></div><Button variant="ghost" size="icon" aria-label={notifications.enabled?t.notificationsOff:t.notificationsOn} title={notifications.permission==='denied'?t.notificationsBlocked:notifications.permission==='unsupported'?t.notificationsUnsupported:notifications.enabled?t.notificationsOff:t.notificationsOn} aria-pressed={notifications.enabled} onClick={()=>{void notifications.toggle().then(()=>{if(typeof Notification==='undefined')setNotice(t.notificationsUnsupported);else if(Notification.permission==='denied')setNotice(t.notificationsBlocked)})}}>{notifications.enabled?<Bell/>:<BellOff/>}</Button><Button variant="ghost" size="icon" aria-label={t.invite} title={t.invite} onClick={invite}><Copy/></Button><Button variant="ghost" size="icon" aria-label={lang==='vi'?'Hiện mã chia sẻ':'Show share code'} onClick={()=>{if(session)document.dispatchEvent(new CustomEvent('whisper:optical',{detail:{mode:'share',url:`${location.origin}/?mode=chat#r=${session.id}&a=${session.access}&k=${session.key}`}}))}}><QrCode/></Button><Popover><PopoverTrigger asChild><Button className="chat-members" variant="ghost" size="icon" aria-label={t.members}><Users/></Button></PopoverTrigger><PopoverContent className="chat-members-menu" align="end"><h2>{t.members}</h2><p className="chat-room-limit">{state?.mode==='rolling'?`${t.keep}: ${state.keep}`:`${state?.sent||0} / ${state?.max_messages||limit}`} · {t.mode}</p>{state?.members.map(p=><div className="chat-member" key={p.id}><ParticipantAvatar name={p.name} id={p.id} person={p} lang={lang} presence/><span>{p.name}<small>{p.id===state.me?t.you:p.host?t.host:t.guest}</small></span><small className="chat-member-status">{!p.online?t.offline:p.focused===false?t.away:t.online}</small></div>)}<Button variant="ghost" className="chat-leave" onClick={()=>setModal({kind:self?.host?'destroy':'leave'})}>{self?.host?<Trash2/>:<LogOut/>}{self?.host?t.destroy:t.leave}</Button></PopoverContent></Popover></div>
   {error&&<p role="alert" className="chat-error chat-room-error">{errorText}</p>}
   <MessageScrollerProvider key={session.id} autoScroll>
    <MessageScroller className="chat-scroller">
     <MessageScrollerViewport className="chat-log" ref={log} aria-label={t.chat} onScroll={()=>{if(active&&!document.hidden&&document.hasFocus()&&log.current&&state&&log.current.scrollHeight-log.current.scrollTop-log.current.clientHeight<80)seen.current=state.sent}}>
      <MessageScrollerContent className="chat-message-list" aria-live="polite">
       {!state?.messages.length&&!state?.events?.length&&<MessageScrollerItem messageId="empty" className="chat-empty"><MessageCircle aria-label={t.empty}/></MessageScrollerItem>}
       {timeline}
      </MessageScrollerContent>
     </MessageScrollerViewport>
     <MessageScrollerButton className="chat-new" size="sm" aria-label={t.newMessages}><ArrowDown/>{t.newMessages}</MessageScrollerButton>
    </MessageScroller>
   </MessageScrollerProvider>
   <div className="chat-typing" aria-live="polite">{state?.members.some(m=>m.id!==state.me&&m.typing)&&<><span className="chat-typing-dots"><i/><i/><i/></span>{state?.members.filter(m=>m.id!==state.me&&m.typing).map(m=>m.name).join(', ')} {t.typing}</>}</div>
   {locked&&!edit?<p className="chat-locked">{t.locked}</p>:<form className="chat-compose" onSubmit={send}>
    <InputGroup>
     <EmojiComposer ref={compose} placeholder={t.placeholder} value={text} onChange={value=>{setText(value);typing.current=Date.now()}}/>
     {(reply||edit||file)&&<InputGroupAddon align="block-start" className="chat-compose-context">{file?<Paperclip/>:edit?<Pencil/>:<Reply/>}<div><strong>{file?t.file:edit?t.edit:t.reply+' · '+(reply?.sender===state?.me?t.you:state?.members.find(p=>p.id===reply?.sender)?.name||'Guest')}</strong><span><EmojiText text={file?file.info.name:spoilerSummary((edit||reply)?.content.text||'').slice(0,120)||reply?.content.file?.name||t.replyGone}/></span></div><InputGroupButton size="icon-sm" aria-label={t.cancel} onClick={()=>{setReply(null);setEdit(null);setFile(null);if(edit)setText('')}}><X/></InputGroupButton></InputGroupAddon>}
     <InputGroupAddon align="block-end"><EmojiMenu lang={lang} onSelect={v=>compose.current?.insert(v)}><InputGroupButton size="icon-sm" aria-label={t.emoji}><SmilePlus/></InputGroupButton></EmojiMenu><InputGroupButton size="icon-sm" disabled={busy||!!edit} title={t.fileHint} aria-label={t.file} onClick={()=>upload.current?.click()}><Paperclip/></InputGroupButton><InputGroupButton size="icon-sm" aria-label="Spoiler" title="Spoiler" onPointerDown={e=>e.preventDefault()} onClick={()=>compose.current?.conceal()}><EyeOff/></InputGroupButton><span className="chat-compose-hint">{text.length>3500?`${text.length} / 4000`:null}</span><InputGroupButton className="chat-send" variant="default" type="submit" size="icon-sm" aria-label={edit?t.save:t.send} disabled={busy||(!text.trim()&&!file)}>{edit?<Check/>:<ArrowUp/>}</InputGroupButton></InputGroupAddon>
    </InputGroup>
    <input hidden ref={upload} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>262144){setError('fileError');return}const bytes=new Uint8Array(await f.arrayBuffer());const type=validFile(f.name,bytes);if(!type){setError('fileError');return}setFile({info:{name:f.name.slice(0,120),size:f.size,type},bytes});setError('')}}/>
   </form>}
   <Mascot line={notice||t.closing}/>
  </main>}
  {!!notice&&<output className="sr-only" aria-live="polite">{notice}</output>}
  <Dialog open={!!modal} onOpenChange={open=>{if(!open)setModal(null)}}><DialogContent className="chat-dialog" showCloseButton={false}>
   <DialogHeader><DialogTitle>{modal?.kind==='link'?t.linkTitle:modal?.kind==='file'?t.download:modal?.kind==='destroy'?t.destroyTitle:t.leaveTitle}</DialogTitle><DialogDescription>{modal?.kind==='link'?t.linkWarning:modal?.kind==='file'?t.filesWarning:modal?.kind==='destroy'?t.destroyHint:t.leaveHint}</DialogDescription></DialogHeader>
   {modal?.kind==='link'&&<code dir="ltr">{modal.url}</code>}<DialogFooter><DialogClose asChild><Button variant="ghost" disabled={busy}>{t.cancel}</Button></DialogClose><Button variant={modal?.kind==='destroy'?'destructive':'default'} disabled={busy} onClick={()=>void confirm()}>{modal?.kind==='link'?t.continue:modal?.kind==='file'?t.download:modal?.kind==='destroy'?t.destroy:t.leave}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div></TooltipProvider>
}
