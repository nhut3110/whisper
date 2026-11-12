import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import sharp from 'sharp';
const slug=/^[a-z][a-z0-9_]{0,23}$/;
export async function importPack({source,id,name,origin,license,attribution,apply=false,root=process.cwd()}){
 if(!slug.test(id||'')||!name||name.length>64||!attribution||attribution.length>200||!/^https:\/\//.test(origin||''))throw Error('Provide a lowercase pack id, name, HTTPS source and attribution');
 const rights=await fs.readFile(license,'utf8');if(!rights.trim()||rights.length>20000)throw Error('License/permission record required (max 20 KB)');
 const packsPath=path.join(root,'shared/emoji-packs.json');const packs=JSON.parse(await fs.readFile(packsPath,'utf8'));
 if(packs.some(p=>p.id===id))throw Error('Pack id already exists; do not change ids/assets used in old messages');
 const stat=await fs.lstat(source);if(stat.isSymbolicLink())throw Error('Symlink sources are not accepted');
 let files=[];
 if(stat.isDirectory()){
  let sourceBytes=0;for(const entry of await fs.readdir(source,{withFileTypes:true})){if(entry.name.startsWith('.'))continue;if(!entry.isFile()||entry.isSymbolicLink())throw Error('Only regular image files are accepted');const file=path.join(source,entry.name);const info=await fs.lstat(file);if(info.isSymbolicLink()||!info.isFile()||info.size>262144||(sourceBytes+=info.size)>16*1024*1024||files.length>=200)throw Error('Images must be <=256 KB; pack <=16 MB and 200 files');files.push([entry.name,await fs.readFile(file)]);}
 }else{
  if(stat.size>16*1024*1024)throw Error('ZIP exceeds 16 MB');let total=0,count=0;
  const archive=unzipSync(await fs.readFile(source),{filter:f=>{
   if(f.name.startsWith('__MACOSX/')||f.name.endsWith('/')||path.basename(f.name).startsWith('.'))return false;
   if(f.name.startsWith('/')||f.name.split(/[\\/]/).includes('..')||f.originalSize>262144||(total+=f.originalSize)>16*1024*1024||++count>200)throw Error('Unsafe ZIP path or archive limit exceeded');return true;
  }});files=Object.entries(archive);
 }
 if(!files.length||files.length>200)throw Error('A pack needs 1–200 images');
 let total=0;const seen=new Set();const pending=[];
 for(const [filename,bytes] of files){
  if(!bytes.length||bytes.length>262144||(total+=bytes.length)>16*1024*1024)throw Error('Images must be <=256 KB; pack <=16 MB');
  const extension=path.extname(filename).slice(1).toLowerCase();if(!['png','gif','webp'].includes(extension))throw Error('Only PNG, GIF and WebP are accepted; no SVG/HTML');
  const meta=await sharp(bytes,{animated:true,limitInputPixels:4194304}).metadata();if(meta.format!==extension||!meta.width||!meta.height||meta.width>256||(meta.pageHeight||meta.height)>256||(meta.pages||1)>120||meta.width*(meta.pageHeight||meta.height)*(meta.pages||1)>4194304)throw Error('Invalid image or dimensions/animation too large (max 256×256, 120 frames)');
  const basename=path.basename(filename,path.extname(filename)).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,32);
  if(!basename||seen.has(basename))throw Error('Empty/duplicate emoji shortcode');seen.add(basename);
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');const src=`/emoji-packs/${id}/${hash.slice(0,24)}.${extension}`;
  pending.push({bytes,entry:{id:id+'_'+basename,name:basename.replaceAll('_',' '),src,sha256:hash,keywords:[id,basename],animated:(meta.pages||1)>1}});
 }
 const pack={id,name,origin,attribution,license: rights.trim(),emojis:pending.map(p=>p.entry)};
 if(!apply)return {dryRun:true,pack};
 const dir=path.join(root,'public/emoji-packs',id);await fs.mkdir(path.dirname(dir),{recursive:true});
 const staging=dir+'.tmp-'+crypto.randomUUID();await fs.mkdir(staging);
 try{
  for(const p of pending)await fs.writeFile(path.join(staging,path.basename(p.entry.src)),p.bytes,{flag:'wx'});
  await fs.rename(staging,dir);
  const timestamp=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);const migration=path.join(root,'supabase/migrations',`${timestamp}_emoji_pack_${id}.sql`);await fs.mkdir(path.dirname(migration),{recursive:true});
  await fs.writeFile(migration,`-- Admin-reviewed ${id}. Source and permission record: shared/emoji-packs.json\nINSERT INTO public.whisper_emoji_catalog(id) VALUES\n${pack.emojis.map(e=>`(':${e.id}:')`).join(',\n')}\nON CONFLICT DO NOTHING;\n`,{flag:'wx'});
  await fs.writeFile(packsPath,JSON.stringify([...packs,pack],null,2)+'\n');
  return {dryRun:false,pack,migration};
 }finally{await fs.rm(staging,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){const key=args[i].replace(/^--/,'');if(!['source','id','name','origin','license','attribution','apply'].includes(key))throw Error('Unknown argument '+args[i]);options[key]=key==='apply'?true:args[++i];}
 try{const r=await importPack(options);console.log(`${r.dryRun?'DRY RUN':'IMPORTED'}: ${r.pack.name} (${r.pack.emojis.length} emoji). ${r.dryRun?'Repeat with --apply to write files.':'Review Git diff, then deploy migrations + frontend. No commit/push was performed.'}`)}catch(e){console.error(e.message);process.exitCode=1}
}
