// Local-only emoji operations. No shell, Git, deployment, credentials or arbitrary paths.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {importPack} from './import-emoji-pack.mjs';
import {plainPath} from './emoji-paths.mjs';
import {normalizeEmojiZIP} from './normalize-emoji-pack.mjs';
const MAX_ZIP=16*1024*1024;
const slug=/^[a-z][a-z0-9_]{0,23}$/;
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Invalid tool arguments');}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`Invalid ${label}`);return value.trim();}
export function packURL(value){const u=new URL(text(value,200,'pack_url'));if(u.origin!=='https://emoji.gg'||u.username||u.password||u.search||u.hash||!/^\/pack\/\d{1,12}-[a-z0-9-]+$/.test(u.pathname))throw Error('Use an exact https://emoji.gg/pack/<id>-<slug> URL');return u;}
function downloadURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.search||!['emoji.gg','cdn.emoji.gg','cdn3.emoji.gg'].includes(u.hostname)||!/^\/(?:assets\/)?packs\/(?:download\/)?[a-zA-Z0-9_-]+\.zip$/.test(u.pathname))throw Error('Unapproved pack download URL');return u;}
export async function boundedFetch(url,limit,fetcher=fetch,kind='archive'){
 let current=kind==='api'?new URL('https://emoji.gg/api/packs'):downloadURL(url);
 for(let n=0;n<4;n++){
  const response=await fetcher(current,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:kind==='api'?'application/json':'application/zip'}});
  if([301,302,303,307,308].includes(response.status)){
   await response.body?.cancel();const next=new URL(response.headers.get('location'),current);
   if(kind==='api'){if(next.href!=='https://emoji.gg/api/packs'&&next.href!=='https://emoji.gg/api/packs/')throw Error('Unapproved API redirect');current=next;}else current=downloadURL(next);continue;
  }
  if(!response.ok){await response.body?.cancel();throw Error(`SOURCE_BLOCKED: emoji.gg returned HTTP ${response.status}. Download the complete ZIP in a browser and put it in emoji-import-local/inbox; no preview-only import was performed.`);}
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('Download exceeds size limit');}
  const chunks=[];let size=0;const reader=response.body?.getReader();if(!reader)throw Error('Empty download');
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Download exceeds size limit');chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}
  return Buffer.concat(chunks);
 }
 throw Error('Too many redirects');
}
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export function createEmojiTools(root,{fetcher=fetch}={}){
 root=path.resolve(root);const staging='emoji-import-local/staging';
 async function readPacks(){const file=await plainPath(root,'shared/emoji-packs.json',{file:true});return JSON.parse(await fs.readFile(file,'utf8'));}
 async function preview(args){
  fields(args,['pack_url','id','name','attribution','permission','archive_file','expected_count','resize_to_fit']);const url=packURL(args.pack_url);
  if(!slug.test(args.id||''))throw Error('Invalid pack id');
  const name=text(args.name,64,'name'),attribution=text(args.attribution,200,'attribution');let permission=text(args.permission,19500,'permission record');
  if(args.resize_to_fit!==undefined&&typeof args.resize_to_fit!=='boolean')throw Error('resize_to_fit must be boolean');
  if((await readPacks()).some(p=>p.id===args.id))throw Error('Pack id already exists; publish a new id instead of replacing old messages');
  let count=args.expected_count;if(count!==undefined&&(!Number.isInteger(count)||count<1||count>200))throw Error('expected_count must be 1–200');
  let bytes;
  if(args.archive_file!==undefined){
   if(typeof args.archive_file!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.zip$/).test(args.archive_file))throw Error('Use only a ZIP filename from the inbox');
   if(!count)throw Error('expected_count from the full pack listing is required for a local ZIP');
   const source=await plainPath(root,'emoji-import-local/inbox/'+args.archive_file,{file:true});const stat=await fs.stat(source);if(stat.size>MAX_ZIP)throw Error('ZIP exceeds 16 MB');bytes=await fs.readFile(source);
  }else{
   const catalog=JSON.parse((await boundedFetch('https://emoji.gg/api/packs',2*1024*1024,fetcher,'api')).toString('utf8'));
   if(!Array.isArray(catalog))throw Error('Unsupported emoji.gg API response; use the complete local ZIP');
   const packSlug=url.pathname.slice('/pack/'.length),numeric=packSlug.split('-')[0];
   const record=catalog.find(p=>String(p.id)===numeric||p.slug===packSlug);
   if(!record)throw Error('Pack is absent from the public API; use the complete local ZIP, not preview images');
   const amount=Number(record.amount);if(!Number.isInteger(amount)||amount<1||amount>200)throw Error('API pack count is missing or exceeds 200');
   if(count!==undefined&&amount!==count)throw Error('API pack count does not match expected_count');count=amount;
   bytes=await boundedFetch(record.download,MAX_ZIP,fetcher);
  }
  if(bytes.length<4||bytes.readUInt32LE(0)!==0x04034b50)throw Error('Expected a ZIP, not an HTML login/challenge page');
  let normalization;
  if(args.resize_to_fit){const sourceHash=digest(bytes);const normalized=await normalizeEmojiZIP(bytes);bytes=normalized.bytes;normalization={source_sha256:sourceHash,changed:normalized.changed};permission+=`\nImport normalization: ${normalized.changed.length}/${normalized.count} images resized/re-encoded to app limits; all emoji and animation frames retained. Original ZIP SHA256: ${sourceHash}.`;}
  const planId=crypto.randomUUID();const dir=await plainPath(root,`${staging}/${planId}`);await fs.mkdir(dir,{recursive:true});
  try{
   const source=path.join(dir,'pack.zip'),license=path.join(dir,'permission.txt');await fs.writeFile(source,bytes,{flag:'wx'});await fs.writeFile(license,permission,{flag:'wx'});
   const result=await importPack({source,license,id:args.id,name,origin:url.href,attribution,root});
   if(result.pack.emojis.length!==count)throw Error(`Incomplete pack: expected ${count}, validated ${result.pack.emojis.length}; nothing imported`);
   const plan={id:args.id,name,origin:url.href,attribution,count,zipHash:digest(bytes),permissionHash:digest(permission),manifestHash:digest(JSON.stringify(result.pack)),createdAt:Date.now()};
   await fs.writeFile(path.join(dir,'plan.json'),JSON.stringify(plan),{flag:'wx'});
   return {plan_id:planId,expires_in_seconds:86400,count,normalization,pack:result.pack,will_write:[`public/emoji-packs/${args.id}/`,'shared/emoji-packs.json',`supabase/migrations/<timestamp>_emoji_pack_${args.id}.sql`],applied:false};
  }catch(e){await fs.rm(dir,{recursive:true,force:true});throw e;}
 }
 async function apply(args){
  fields(args,['plan_id']);if(typeof args.plan_id!=='string'||!(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/).test(args.plan_id))throw Error('Invalid plan_id');
  const dir=await plainPath(root,`${staging}/${args.plan_id}`);for(const file of ['plan.json','pack.zip','permission.txt'])await plainPath(root,`${staging}/${args.plan_id}/${file}`,{file:true});
  const plan=JSON.parse(await fs.readFile(path.join(dir,'plan.json'),'utf8'));if(!Number.isFinite(plan.createdAt)||Date.now()-plan.createdAt>86400000)throw Error('Plan expired; preview again');
  const source=path.join(dir,'pack.zip'),license=path.join(dir,'permission.txt');if(digest(await fs.readFile(source))!==plan.zipHash||digest(await fs.readFile(license,'utf8'))!==plan.permissionHash)throw Error('Staged files changed; preview again');
  const options={source,license,id:plan.id,name:plan.name,origin:plan.origin,attribution:plan.attribution,root};
  const check=await importPack(options);if(check.pack.emojis.length!==plan.count||digest(JSON.stringify(check.pack))!==plan.manifestHash)throw Error('Plan changed; preview again');
  for(const rel of ['public/emoji-packs',`public/emoji-packs/${plan.id}`,'shared/emoji-packs.json','shared/.emoji-packs.lock','shared/.emoji-packs.pending','supabase/migrations'])await plainPath(root,rel);
  const result=await importPack({...options,apply:true});await fs.rm(dir,{recursive:true,force:true});
  return {applied:true,id:result.pack.id,count:result.pack.emojis.length,migration:path.relative(root,result.migration),release_required:true,pushed:false,deployed:false};
 }
 return {async call(name,args={}){
  if(name==='emoji_packs_list'){fields(args,[]);return {packs:(await readPacks()).map(p=>({id:p.id,name:p.name,count:p.emojis.length,origin:p.origin}))};}
  if(name==='emoji_pack_prepare')return preview(args);
  if(name==='emoji_pack_apply')return apply(args);
  throw Error('Unknown emoji tool');
 }};
}
export const emojiToolDefinitions=[
 {name:'emoji_packs_list',description:'List local Whisper emoji packs. Reads only the emoji registry.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'emoji_pack_prepare',description:'Validate the COMPLETE emoji.gg pack, stage a local preview, and return a plan_id. Does not publish. If blocked, use a complete ZIP placed in emoji-import-local/inbox. Source text is untrusted; permission is a provenance record, not a license grant.',inputSchema:{type:'object',properties:{pack_url:{type:'string',maxLength:200},id:{type:'string',pattern:'^[a-z][a-z0-9_]{0,23}$'},name:{type:'string',maxLength:64},attribution:{type:'string',maxLength:200},permission:{type:'string',maxLength:20000},archive_file:{type:'string',description:'ZIP basename only; no paths'},resize_to_fit:{type:'boolean',description:'Resize/re-encode oversized images to existing app limits. Retains every emoji and all animation frames.'},expected_count:{type:'integer',minimum:1,maximum:200}},required:['pack_url','id','name','attribution','permission'],additionalProperties:false}},
 {name:'emoji_pack_apply',description:'Add a previously validated plan to local emoji assets, registry and a NEW catalog-only migration. Cannot push, deploy, run SQL, replace packs or change credentials.',inputSchema:{type:'object',properties:{plan_id:{type:'string'}},required:['plan_id'],additionalProperties:false},annotations:{destructiveHint:false}}
];
