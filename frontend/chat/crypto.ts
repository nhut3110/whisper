export const FILE_LIMIT=262144;
const encoder=new TextEncoder();
export const b64=(v:Uint8Array)=>{let s='';for(let i=0;i<v.length;i+=8192)s+=String.fromCharCode(...v.subarray(i,i+8192));return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')};
export const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export async function encrypt(bytes:Uint8Array,key:string,room:string,kind='text'){
 const imported=await crypto.subtle.importKey('raw',unb64(key),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));
 return {ciphertext:b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`whisper:chat:v1:${room}:${kind}`)},imported,bytes as BufferSource))),iv:b64(iv)};
}
export async function decrypt(ciphertext:string,iv:string,key:string,room:string,kind='text'){
 const imported=await crypto.subtle.importKey('raw',unb64(key),'AES-GCM',false,['decrypt']);
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(`whisper:chat:v1:${room}:${kind}`)},imported,unb64(ciphertext)));
}
export type FileInfo={name:string,size:number,type:string};
export function validFile(name:string,bytes:Uint8Array):string|null{
 if(!bytes.length||bytes.length>FILE_LIMIT)return null;
 const ext=name.split('.').pop()?.toLowerCase();const starts=(v:number[])=>v.every((n,i)=>bytes[i]===n);
 if(ext==='png'&&starts([137,80,78,71,13,10,26,10]))return 'image/png';
 if(['jpg','jpeg'].includes(ext||'')&&starts([255,216,255]))return 'image/jpeg';
 if(ext==='webp'&&starts([82,73,70,70])&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP')return 'image/webp';
 if(ext==='pdf'&&starts([37,80,68,70,45]))return 'application/pdf';
 if(ext==='txt'||ext==='csv'){try{const s=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))return ext==='csv'?'text/csv':'text/plain'}catch{}}
 return null;
}
export function safeURL(value:string):URL|null{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url:null}catch{return null}}
export function parseInvite(hash:string){
 const p=new URLSearchParams(hash.replace(/^#/,''));const id=p.get('r'),access=p.get('a'),key=p.get('k');
 if(!id||!access||!key||![id,access,key].every(v=>/^[A-Za-z0-9_-]{43}$/.test(v)&&unb64(v).length===32&&b64(unb64(v))===v))throw Error('invalid');
 return {id,access,key};
}
export type ChatContent={text:string,file?:FileInfo};
export function parseContent(bytes:Uint8Array):ChatContent{
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!value||Array.isArray(value)||typeof value.text!=='string'||value.text.length>4000)throw Error('invalid');
 if(value.file!=null){
  const f=value.file;
  if(typeof f!=='object'||Array.isArray(f)||typeof f.name!=='string'||!f.name||f.name.length>120||/[\\/\u0000-\u001f]/.test(f.name)||!Number.isInteger(f.size)||f.size<1||f.size>FILE_LIMIT||!['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv'].includes(f.type))throw Error('invalid');
  return {text:value.text,file:{name:f.name,size:f.size,type:f.type}};
 }
 return {text:value.text};
}
