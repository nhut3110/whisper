import {validReaction} from '../../../shared/reactions.ts';
import type {RPC} from './handler.ts';
const token=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const box=(v:unknown,max:number)=>typeof v==='string'&&v.length>=22&&v.length<=max&&/^[A-Za-z0-9_-]+$/.test(v);
const integer=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),n=>n.toString(16).padStart(2,'0')).join('');
export async function chatRequest(path:string,v:Record<string,unknown>,rpc:RPC,identity:Record<string,string>){
 const action=path==='/rooms'?'create':path.match(/^\/rooms\/[A-Za-z0-9_-]{43}\/(join|sync|send|edit|delete|react|file|leave|destroy)$/)?.[1];
 const bad={status:400,body:{error:'Invalid room request',code:'invalid'}};
 if(!action||!token(v.member))return bad;
 const id=action==='create'?v.id:path.split('/')[2];if(!token(id))return bad;
 const payload:Record<string,unknown>={...identity,id,member_hash:await hash(v.member)};
 if(['create','join'].includes(action)){
  if(!token(v.access)||typeof v.name!=='string'||!v.name.trim()||v.name.length>32)return bad;
  Object.assign(payload,{access_hash:await hash(v.access),name:v.name.trim()});
 }
 if(action==='create'){
  if(!integer(v.ttl,300,172800)||!integer(v.max_members,2,12)||!integer(v.max_messages,10,1000)||!['total','rolling'].includes(String(v.mode))||!integer(v.keep,1,200))return bad;
  Object.assign(payload,{ttl:v.ttl,max_members:v.max_members,max_messages:v.max_messages,mode:v.mode,keep:v.keep});
 }
 if(action==='sync'){
  if(!integer(v.seen,0,1000000)||typeof v.typing!=='boolean')return bad;
  Object.assign(payload,{seen:v.seen,typing:v.typing});
 }
 if(action==='send'||action==='edit'){
  if(!box(v.ciphertext,22000)||typeof v.iv!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(v.iv))return bad;
  Object.assign(payload,{ciphertext:v.ciphertext,iv:v.iv});
  if(action==='send'){
   if(typeof v.nonce!=='string'||!/^\w{32}$/.test(v.nonce)||v.reply!=null&&!integer(v.reply,1,1000000))return bad;
   if(v.file!=null&&(!box(v.file,350000)||typeof v.file_iv!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(v.file_iv)))return bad;
   Object.assign(payload,{nonce:v.nonce,reply:v.reply??null,file:v.file??null,file_iv:v.file_iv??null});
  }
 }
 if(['edit','delete','react','file'].includes(action)){
  if(!integer(v.seq,1,1000000))return bad;payload.seq=v.seq;
 }
 if(action==='react'){if(!validReaction(v.emoji))return bad;payload.emoji=v.emoji;}
 return rpc('chat_'+action,payload);
}
