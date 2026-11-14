import {animateParticle} from './render'
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
/** Bounded, sequential frames. The worker owns quantization/encoding; closing cancels. */
export function exportNebula(url:string,light:boolean,progress:(n:number)=>void,finished:(error?:boolean)=>void){
 const canvas=document.createElement('canvas'),render=animateParticle(canvas,url,{still:true,light}),worker=new Worker(new URL('./export.worker.ts',import.meta.url),{type:'module'});
 let frame=0,stopped=false;const count=32;
 const stop=()=>{stopped=true;worker.terminate();render()};
 const next=()=>{if(stopped)return;render.draw(1.4+frame*.35);const pixels=canvas.getContext('2d')!.getImageData(0,0,480,480).data;worker.postMessage({pixels:pixels.buffer,size:480,last:frame===count-1},[pixels.buffer]);frame++;progress(Math.round(frame/count*100))};
 worker.onmessage=({data})=>{if(data.error){stop();finished(true)}else if(data.done){download(new Blob([data.done],{type:'image/gif'}),'whisper-nebula.gif');stop();finished()}else next()};
 worker.onerror=()=>{stop();finished(true)};next();return stop;
}
