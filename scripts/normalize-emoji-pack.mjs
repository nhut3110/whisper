import path from 'node:path';
import {unzipSync,zipSync} from 'fflate';
import sharp from 'sharp';
// Explicit import option: resize/re-encode every incompatible image, never drop one.
export async function normalizeEmojiZIP(bytes){
 let total=0,count=0;const source=unzipSync(bytes,{filter:f=>{
  if(f.name.startsWith('__MACOSX/')||f.name.endsWith('/')||path.basename(f.name).startsWith('.'))return false;
  if(f.name.startsWith('/')||f.name.split(/[\\/]/).includes('..')||f.originalSize>2*1024*1024||(total+=f.originalSize)>16*1024*1024||++count>200)throw Error('Unsafe ZIP path or normalization input limit exceeded');return true;
 }});
 if(!count)throw Error('Empty pack');const output={},changes=[];let outputBytes=0;
 for(const [name,input]of Object.entries(source)){
  const format=path.extname(name).slice(1).toLowerCase();if(!['png','gif','webp'].includes(format))throw Error('Only PNG, GIF and WebP can be normalized');
  const meta=await sharp(input,{animated:true,limitInputPixels:33554432}).metadata(),frames=meta.pages||1;
  if(meta.format!==format||!meta.width||!meta.height||frames>120)throw Error('Invalid image or animation exceeds 120 frames; no frames are discarded');
  let result=input;const height=meta.pageHeight||meta.height;
  if(input.length>262144||meta.width>256||height>256||meta.width*height*frames>4194304){
   let valid=false;
   for(const edge of [256,192,128,96]){
    if(edge*edge*frames>4194304)continue;
    let pipeline=sharp(input,{animated:true,limitInputPixels:33554432}).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true});
    pipeline=format==='png'?pipeline.png({compressionLevel:9}):format==='gif'?pipeline.gif({effort:3,colours:128,keepDuplicateFrames:true}):pipeline.webp({quality:85,effort:3});
    result=await pipeline.toBuffer();const m=await sharp(result,{animated:true,limitInputPixels:4194304}).metadata();
    if((m.pages||1)!==frames)throw Error('Normalization changed frame count');
    if(result.length<=262144&&m.width<=256&&(m.pageHeight||m.height)<=256){valid=true;break;}
   }
   if(!valid)throw Error('Image cannot fit import limits without losing frames');
   changes.push({file:name,before:input.length,after:result.length,frames});
  }
  outputBytes+=result.length;if(outputBytes>16*1024*1024)throw Error('Normalized pack exceeds 16 MB');output[name]=result;
 }
 return {bytes:Buffer.from(zipSync(output)),count,changed:changes};
}
