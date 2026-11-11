// Real local MediaRecorder + encrypted binary envelope. No microphone data leaves this module before encryption.
import {BINARY_LIMIT} from './crypto.js';
import {t} from './i18n.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),magic='whisper:audio:v1\n';
export const MAX_SECONDS=120;
const allowed=new Set(['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav']);
export async function packClip(clip){
 const header=encoder.encode(magic+JSON.stringify({mime:clip.blob.type,seconds:clip.seconds,peaks:clip.peaks})+'\n');
 const bytes=new Uint8Array(header.length+clip.blob.size);bytes.set(header);bytes.set(new Uint8Array(await clip.blob.arrayBuffer()),header.length);
 if(bytes.length>BINARY_LIMIT)throw new Error('audioLimit');return bytes;
}
export function unpackClip(bytes){
 const signature=encoder.encode(magic);if(!signature.every((b,i)=>bytes[i]===b))return null;
 const end=bytes.indexOf(10,signature.length);if(end<0||end>4096)throw new Error('decodeError');
 const header=JSON.parse(decoder.decode(bytes.subarray(signature.length,end)));
 if(!allowed.has(String(header.mime).split(';')[0])||!Number.isFinite(header.seconds)||header.seconds<.3||header.seconds>MAX_SECONDS+.5||!Array.isArray(header.peaks)||header.peaks.length>64||header.peaks.some(p=>!Number.isInteger(p)||p<0||p>255)||bytes.length<=end+1||bytes.length>BINARY_LIMIT)throw new Error('decodeError');
 return {blob:new Blob([bytes.subarray(end+1)],{type:header.mime}),seconds:header.seconds,peaks:header.peaks};
}
export function resample(samples,n=40){return Array.from({length:n},(_,i)=>{const from=Math.floor(i*samples.length/n),to=Math.max(from+1,Math.floor((i+1)*samples.length/n));let peak=0;for(let k=from;k<to&&k<samples.length;k++)peak=Math.max(peak,samples[k]);return Math.round(Math.min(1,peak)*255);});}
export function clock(seconds){const s=Math.floor(Math.max(0,seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
export function paintWave(root,peaks,progress=0){
 if(root.children.length!==peaks.length){root.replaceChildren(...peaks.map(()=>{const bar=document.createElement('i');bar.className='voice-bar';return bar;}));}
 Array.from(root.children).forEach((bar,i)=>{bar.style.height=`${4+Math.max(0,Math.min(255,peaks[i]))/255*26}px`;bar.toggleAttribute('data-played',i/Math.max(1,peaks.length)<=progress);});
}
export function createPlayer(root,clip,onState=()=>{}){
 const audio=document.createElement('audio'),url=URL.createObjectURL(clip.blob);audio.src=url;audio.preload='metadata';
 const row=document.createElement('div');row.className='voice-player';
 const play=document.createElement('button');play.type='button';play.className='voice-play';
 const wave=document.createElement('div');wave.className='voice-wave';wave.setAttribute('aria-hidden','true');
 const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.className='voice-seek';
 const track=document.createElement('div');track.className='voice-track';track.append(wave,seek);
 const time=document.createElement('output');time.className='voice-time';row.append(play,track,time);const error=document.createElement('p');error.className='muted';error.setAttribute('role','status');root.replaceChildren(row,audio,error);
 function fail(){error.textContent=t('playbackFailed');onState('error');}
 function update(){const p=Math.max(0,Math.min(1,audio.currentTime/clip.seconds));seek.value=String(Math.round(p*1000));seek.setAttribute('aria-valuetext',`${clock(audio.currentTime)} / ${clock(clip.seconds)}`);paintWave(wave,clip.peaks,p);time.textContent=clock(audio.paused?clip.seconds:audio.currentTime);}
 function labels(){play.textContent=audio.paused?'▶':'Ⅱ';play.setAttribute('aria-label',t(audio.paused?'play':'pause'));seek.setAttribute('aria-label',t('audioMessage'));}
 play.addEventListener('click',async()=>{try{if(!audio.paused)audio.pause();else{if(audio.ended)audio.currentTime=0;await audio.play();}}catch{fail();}});
 seek.addEventListener('input',()=>{audio.currentTime=Number(seek.value)/1000*clip.seconds;update();});
 for(const event of ['timeupdate','loadedmetadata','seeked'])audio.addEventListener(event,update);
 for(const event of ['play','pause','ended'])audio.addEventListener(event,()=>{labels();update();onState(audio.paused?'ready':'playing');});
 audio.addEventListener('error',fail);
 window.addEventListener('whisper-languagechange',labels);labels();update();
 return {pause(){audio.pause();},destroy(){audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);window.removeEventListener('whisper-languagechange',labels);root.replaceChildren();}};
}
export function createRecorder(button,{onState,onWave,onClip,onError}){
 let held=false,request=0,stream=null,recorder=null,context=null,analyser=null,sampleTimer=null,limitTimer=null,clip=null,started=0,chunks=[],samples=[],aborted=false,recording=false;
 function resources(){clearInterval(sampleTimer);clearTimeout(limitTimer);stream?.getTracks().forEach(track=>track.stop());stream=null;context?.close().catch(()=>{});context=null;analyser=null;}
 function stop(discard=false){held=false;if(discard){request++;aborted=true;}if(recorder?.state==='recording'){recording=false;recorder.stop();}resources();}
 async function start(){
  if(held||recording)return;held=true;aborted=false;const mine=++request;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){held=false;onError('micUnsupported');return;}
  onState('waiting');let ownedStream=null,ownedContext=null;
  try{
   const incoming=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(mine!==request||!held||document.hidden){incoming.getTracks().forEach(track=>track.stop());if(mine===request)onState(clip?'ready':'idle');return;}
   stream=incoming;ownedStream=incoming;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
   recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});
   if(!allowed.has(recorder.mimeType.split(';')[0]))throw new Error('unsupported');
   chunks=[];samples=[];let size=0;const active=recorder;
   active.ondataavailable=e=>{if(mine!==request)return;if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>BINARY_LIMIT-4096){aborted=true;stop();onError('audioLimit');}}};
   active.onerror=()=>{aborted=true;stop();onError('micUnsupported');};
   active.onstop=()=>{
    if(mine!==request||aborted)return;
    const seconds=Math.min(MAX_SECONDS,(performance.now()-started)/1000),blob=new Blob(chunks,{type:active.mimeType});chunks=[];
    if(mine!==request||aborted)return;
    if(seconds<.5||!blob.size){onState(clip?'ready':'idle');return;}
    if(blob.size>BINARY_LIMIT-4096){onError('audioLimit');return;}
    clip={blob,seconds,peaks:resample(samples)};onClip(clip);onState('ready');
   };
   // A real analyser drives the waveform. If Web Audio is unavailable, recording still works.
   try{ownedContext=new (window.AudioContext||window.webkitAudioContext)();context=ownedContext;await ownedContext.resume();if(!held||mine!==request){ownedStream.getTracks().forEach(t=>t.stop());ownedContext.close().catch(()=>{});if(stream===ownedStream)stream=null;if(context===ownedContext)context=null;if(mine===request)onState(clip?'ready':'idle');return;}analyser=ownedContext.createAnalyser();analyser.fftSize=256;ownedContext.createMediaStreamSource(ownedStream).connect(analyser);}catch{ownedContext?.close().catch(()=>{});if(context===ownedContext)context=null;}
   if(!held||mine!==request){resources();return;}
   started=performance.now();recording=true;active.start(200);onState('recording');
   sampleTimer=setInterval(()=>{let rms=0;if(analyser){const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);for(const b of data)rms+=((b-128)/128)**2;rms=Math.min(1,Math.sqrt(rms/data.length)*5);}samples.push(rms);onWave(resample(samples.slice(-32),28),(performance.now()-started)/1000);},70);
   limitTimer=setTimeout(()=>stop(),MAX_SECONDS*1000);
  }catch(e){ownedStream?.getTracks().forEach(t=>t.stop());ownedContext?.close().catch(()=>{});if(mine!==request)return;resources();held=false;recording=false;if(mine===request)onError(e.name==='NotAllowedError'||e.name==='SecurityError'?'micDenied':'micUnsupported');}
 }
 button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();button.focus();try{button.setPointerCapture(e.pointerId);}catch{}start();});
 const up=()=>{if(held)stop();};window.addEventListener('pointerup',up);window.addEventListener('pointercancel',()=>stop(true));window.addEventListener('blur',()=>{if(held)stop(true);});
 button.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start();}});button.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();up();}});
 button.addEventListener('contextmenu',e=>e.preventDefault());
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop(true);onState(clip?'ready':'idle');}});
 return {stop,clear(){stop(true);clip=null;onState('idle');},getClip:()=>clip,isActive:()=>held||recording};
}
