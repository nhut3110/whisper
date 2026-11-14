// Disposable development object store. Production always uses Supabase Storage.
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ChatStorage} from '../supabase/functions/whisper/storage.ts';
export async function localChatStorage():Promise<ChatStorage>{
 const root=await mkdtemp(join(tmpdir(),'whisper-chat-storage-'));
 const path=(id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid object path');return join(root,id)};
 const cleanup=()=>{void rm(root,{recursive:true,force:true}).finally(()=>process.exit())};
 process.once('SIGTERM',cleanup);process.once('SIGINT',cleanup);
 return {
  put:async(id,bytes)=>{await writeFile(path(id),bytes,{flag:'wx',mode:0o600})},
  get:async id=>new Uint8Array(await readFile(path(id))),
  remove:async ids=>{for(const id of ids)await rm(path(id),{force:true})},
 };
}
