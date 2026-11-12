// Shared, domain-separated signatures. No IP, cookie identifier or secret reaches the browser JS.
const encoder=new TextEncoder();
export type Client = {owner:string;network:string};
export const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export async function mac(secret:string,value:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
export function same(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export function apiPath(url:string){return new URL(url).pathname.replace(/^\/functions\/v1\/whisper(?=\/|$)/,'').replace(/^\/whisper(?=\/|$)/,'').replace(/^\/api(?=\/|$)/,'');}
export async function signClient(secret:string,method:string,path:string,client:Client,now=Date.now()){
 const stamp=String(Math.floor(now/1000)),data=`gateway:v1:${method}:${path}:${stamp}:${client.owner}:${client.network}`;
 return {'x-whisper-time':stamp,'x-whisper-owner':client.owner,'x-whisper-network':client.network,'x-whisper-signature':await mac(secret,data)};
}
export async function readClient(secret:string,req:Request,now=Date.now()):Promise<Client|null>{
 const h=req.headers,stamp=h.get('x-whisper-time')||'',owner=h.get('x-whisper-owner')||'',network=h.get('x-whisper-network')||'',signature=h.get('x-whisper-signature')||'';
 if(!/^\d{10}$/.test(stamp)||Math.abs(now/1000-Number(stamp))>30||!/[a-f0-9]{64}/.test(owner)||!/[a-f0-9]{64}/.test(network)||owner.length!==64||network.length!==64)return null;
 const expected=await signClient(secret,req.method,apiPath(req.url),{owner,network},Number(stamp)*1000);
 return same(signature,expected['x-whisper-signature'])?{owner,network}:null;
}
