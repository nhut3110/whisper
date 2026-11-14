import {useEffect,useRef,useState} from 'react'
const preference='whisper-chat-notifications'
export function incomingAfter<T extends {seq:number,sender:string}>(messages:T[],after:number,me:string){return messages.filter(m=>m.seq>after&&m.sender!==me&&!('pending' in m&&m.pending))}
/** Never expose message text, names, room URLs or keys to OS notifications. */
export function useChatNotifications({room,me,messages,active,label}:{room?:string;me?:string;messages?:Array<{seq:number,sender:string}>;active:boolean;label:string}){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem(preference)==='1'}catch{return false}})
 const [permission,setPermission]=useState<NotificationPermission|'unsupported'>(()=>typeof Notification==='undefined'?'unsupported':Notification.permission)
 const [unread,setUnread]=useState(0),watermark=useRef<number|null>(null),currentRoom=useRef(room),notice=useRef<Notification|null>(null),audio=useRef<AudioContext|null>(null),title=useRef('Whisper.')
 const focused=()=>active&&!document.hidden&&document.hasFocus()
 const clear=()=>{setUnread(0);notice.current?.close();notice.current=null}
 useEffect(()=>{
  if(!enabled)return
  const unlock=()=>{try{const ctx=audio.current??=new AudioContext();void ctx.resume().catch(()=>{})}catch{}}
  document.addEventListener('pointerdown',unlock,{once:true});document.addEventListener('keydown',unlock,{once:true});
  return()=>{document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock)}
 },[enabled])
 useEffect(()=>{title.current=document.title;return()=>{document.title=title.current;notice.current?.close();void audio.current?.close()}},[])
 useEffect(()=>{const focus=()=>{if(focused())clear()};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);focus();return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}},[active])
 useEffect(()=>{if(currentRoom.current!==room){currentRoom.current=room;watermark.current=null;clear()}if(!room){watermark.current=null;clear()}},[room])
 useEffect(()=>{document.title=unread?`(${unread}) Whisper.`:title.current},[unread])
 useEffect(()=>{
  if(!room||!me||!messages)return
  const high=Math.max(0,...messages.map(m=>m.seq>0?m.seq:0)),previous=watermark.current;watermark.current=Math.max(previous??0,high)
  if(previous===null||focused())return
  const incoming=incomingAfter(messages,previous,me);if(!incoming.length)return
  setUnread(n=>n+incoming.length)
  if(!enabled)return
  if(typeof Notification!=='undefined'&&Notification.permission==='granted')try{
   notice.current?.close();const n=new Notification('Whisper.',{body:label,tag:'whisper-chat',icon:'/favicon.svg'});notice.current=n
   n.onclick=()=>{window.focus();document.getElementById('room-mode')?.click();n.close()}
  }catch{/* Some mobile browsers require service-worker notifications. Badge still works. */}
  const ctx=audio.current;if(ctx?.state==='running')try{const tone=ctx.createOscillator(),volume=ctx.createGain();tone.connect(volume);volume.connect(ctx.destination);tone.frequency.setValueAtTime(660,ctx.currentTime);tone.frequency.exponentialRampToValueAtTime(880,ctx.currentTime+.1);volume.gain.setValueAtTime(.035,ctx.currentTime);volume.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2);tone.start();tone.stop(ctx.currentTime+.21)}catch{}
 },[messages,room,me,active,enabled,label])
 async function toggle(){
  if(enabled){setEnabled(false);try{localStorage.setItem(preference,'0')}catch{}notice.current?.close();return}
  if(typeof Notification==='undefined'){setPermission('unsupported');return}
  try{const ctx=audio.current??=new AudioContext();void ctx.resume().catch(()=>{})}catch{}
  let next=Notification.permission;try{if(next==='default')next=await Notification.requestPermission()}catch{}
  setPermission(next);if(next==='granted'){setEnabled(true);try{localStorage.setItem(preference,'1')}catch{}}
 }
 return {enabled,permission,unread,toggle}
}
