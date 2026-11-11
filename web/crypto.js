const encoder = new TextEncoder();
export const TEXT_LIMIT=262144, BINARY_LIMIT=2097152;
export function b64(bytes){let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unb64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Link không hợp lệ.');
  return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
}
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const aad = encoder.encode('hush:message:v1');
export async function seal(text,suppliedKey=null){
 const bytes=encoder.encode(text);
 if(!text.trim()||bytes.length>TEXT_LIMIT)throw new Error('text_limit');
 return sealBytes(bytes,suppliedKey);
}
export async function sealBytes(bytes,suppliedKey=null){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>BINARY_LIMIT)throw new Error('audio_limit');
 const key=suppliedKey?await crypto.subtle.importKey('raw',unb64(suppliedKey),'AES-GCM',true,['encrypt','decrypt']):await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,bytes);
 return {ciphertext:b64(new Uint8Array(ciphertext)),iv:b64(iv),key:b64(new Uint8Array(await crypto.subtle.exportKey('raw',key)))};
}
export async function unsealBytes(ciphertext,iv,key){
 const raw=unb64(key);if(raw.length!==32)throw new Error('invalid_link');
 const imported=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:aad},imported,unb64(ciphertext)));
}
export async function unseal(ciphertext,iv,key){return new TextDecoder('utf-8',{fatal:true}).decode(await unsealBytes(ciphertext,iv,key));}
export function readLink(fragment) {
  const p=new URLSearchParams(fragment.replace(/^#/,''));
  const key=p.get('k'),access=p.get('a');
  if (!key || !access || unb64(key).length!==32 || unb64(access).length!==32) throw new Error('Link thiếu khoá hoặc không đúng định dạng.');
  return {key,access};
}
export function randomPin() {
  // Rejection sampling avoids modulo bias.
  const n=new Uint32Array(1); do {crypto.getRandomValues(n);} while(n[0]>=4294000000);
  return String(n[0]%1000000).padStart(6,'0');
}

// A 128-bit random seed is never uploaded. HKDF domain separation gives independent
// encryption/access/lookup values; effective secret strength is 128 bits, not 256.
export async function deriveShortLink(seed) {
  const raw=unb64(seed);
  if(seed.length!==22||raw.length!==16||b64(raw)!==seed)throw new Error('Link ngắn không đúng định dạng.');
  const material=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveBits']);
  const derive=async label=>b64(new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:encoder.encode('hush:short:v1'),info:encoder.encode(label)},material,256)));
  const [key,access,id]=await Promise.all(['encryption','access','lookup'].map(derive));
  return {seed,key,access,id};
}
export const newShortLink=()=>deriveShortLink(b64(crypto.getRandomValues(new Uint8Array(16))));
