import {t} from '/i18n.js';
/* Adapted from Bencho Watcher, WakeSlider and SlideConfirm.
 * Copyright (c) 2026 Lorenzo Cabra. MIT; see references/bencho/LICENSE.
 * Watcher uses a bounded shared face rig; wake energy / anchored handle morph retain source geometry.
 */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
export function watcher(button){
 const body='M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z';
 button.innerHTML=`<svg class="eyt-ball" viewBox="0 0 100 100" aria-hidden="true"><path class="eyt-body" d="${body}"/><g class="face-rig"><path class="bot-brow" d="M34 31q5-4 10-1m12 0q5-3 10 1"/><g class="eye"><rect class="eyt-eye"/></g><g class="eye"><rect class="eyt-eye"/></g><ellipse class="bot-cheek" cx="30" cy="58" rx="5" ry="2.5"/><ellipse class="bot-cheek" cx="70" cy="58" rx="5" ry="2.5"/><path class="bot-mouth" d="M43 62 Q50 69 57 62"/><g class="anonymous-glasses"><path d="M22 37h23v13q-11 15-23 0Zm33 0h23v13q-11 15-23 0Z"/><path class="glasses-bridge" d="M45 41q5-5 10 0M15 37h7m56 0h7"/><path class="glasses-shine" d="m27 41h5m28 0h5"/></g></g><g class="recording-gear"><path class="headband" d="M9 48V37a41 38 0 0 1 82 0v11"/><rect class="ear-pad" x="3" y="36" width="12" height="26" rx="6"/><rect class="ear-pad" x="85" y="36" width="12" height="26" rx="6"/><path class="mic-boom" d="M91 57v9q0 9-16 9h-8"/><rect class="mic-tip" x="59" y="71" width="14" height="8" rx="4"/></g><g class="performing-gear"><path class="mic-handle" d="m76 85 7-19"/><ellipse class="mic-head" cx="85" cy="61" rx="7" ry="9" transform="rotate(20 85 61)"/><path class="mic-mesh" d="m81 57 8 3m-9 1 8 3"/><path class="mic-hand" d="M85 80q-10-8-15 0"/></g></svg>`;
 const rig=button.querySelector('.face-rig'),eyes=button.querySelectorAll('.eye'),shell=button.querySelector('.eyt-body'),mouth=button.querySelector('.bot-mouth');
 const pose={x:0,y:0,vx:0,vy:0,tx:0,ty:0},pointer={x:0,y:0,known:false};
 // [left eye height, right eye height, mouth width/curve/opening, face tilt]
 const moods={neutral:[14,14,6,3,0,0],happy:[7,7,8,6,0,0],curious:[15,11,3,2,0,-3],wink:[2,12,7,5,0,3],blush:[7,7,5,4,0,-2],surprised:[18,18,3,-3,11,0],sleepy:[5,5,4,1,0,2],yawn:[4,4,4,-3,12,-2],smile:[9,9,8,5,0,1],squint:[4,4,6,3,0,-1],listening:[16,16,3,-2,5,0],playing:[8,8,6,4,1,0],sad:[11,11,6,-4,0,-2]};
 const features=[...moods.neutral],pool=['happy','curious','wink','blush','surprised','sleepy','yawn','smile','squint'];
 let raf=0,prev=0,blink=-1000,blinkTimer=0,phaseTimer=0,emoteTimer=0,resetTimer=0,phase='follow',disposed=false,lastEmote=-1;
 let touch=matchMedia('(pointer: coarse)').matches||!matchMedia('(any-hover: hover)').matches;
 button.dataset.emote='neutral';
 function visible(){return !disposed&&!document.hidden&&button.getClientRects().length>0;}
 function operational(){return ['listening','playing','sad'].includes(button.dataset.expression);}
 function targetMood(){return moods[operational()?button.dataset.expression:button.dataset.emote==='neutral'?button.dataset.expression:button.dataset.emote]||moods.neutral;}
 function draw(now){
  const x=clamp(pose.x,-8,8),y=clamp(pose.y,-5,5),tilt=x*.28+features[5];
  rig.setAttribute('transform',`translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${tilt.toFixed(3)} 50 50)`);
  shell.setAttribute('transform',`rotate(${(tilt*.12).toFixed(3)} 50 50)`);
  const since=now-blink,lid=since>=0&&since<180?1-.94*Math.sin(since/180*Math.PI):1;
  eyes.forEach((g,i)=>{
   const height=Math.max(.9,features[i]*lid),width=8,r=g.firstElementChild;
   for(const [key,value] of Object.entries({x:-width/2,y:-height/2,width,height,rx:Math.min(4.25,height/2)}))r.setAttribute(key,String(value));
   g.setAttribute('transform',`translate(${i?61:39} 44)`);
  });
  const w=features[2],curve=features[3],h=features[4];
  mouth.setAttribute('d',`M${50-w} 62 Q50 ${62+curve} ${50+w} 62 Q50 ${62+curve+h} ${50-w} 62`);
 }
 function tick(now){
  raf=0;if(!visible()){prev=0;return;}
  const dt=prev?Math.min(2,(now-prev)/16.67):1;prev=now;const target=targetMood();
  if(still){pose.x=pose.tx;pose.y=pose.ty;features.splice(0,6,...target);}else{
   pose.vx+=((pose.tx-pose.x)*.065-pose.vx*.36)*dt;pose.vy+=((pose.ty-pose.y)*.065-pose.vy*.36)*dt;
   pose.x=clamp(pose.x+pose.vx*dt,-8,8);pose.y=clamp(pose.y+pose.vy*dt,-5,5);
   features.forEach((v,i)=>features[i]=Math.abs(target[i]-v)<.005?target[i]:v+(target[i]-v)*(1-Math.exp(-dt*.18)));
  }
  draw(now);
  const unsettled=Math.abs(pose.tx-pose.x)+Math.abs(pose.ty-pose.y)+Math.abs(pose.vx)+Math.abs(pose.vy)+features.reduce((sum,v,i)=>sum+Math.abs(v-target[i]),0)>.008;
  if(!still&&(unsettled||now-blink<180))raf=requestAnimationFrame(tick);else prev=0;
 }
 function wake(){if(!raf&&visible())raf=requestAnimationFrame(tick);}
 function rest(){pose.tx=pose.ty=0;wake();}
 function aim(){
  if(!visible()||touch||phase==='front'||!pointer.known||button.classList.contains('anonymous')||still){rest();return;}
  const r=button.getBoundingClientRect(),gain=button.closest('.voice-mode') ? .72 : 1;
  pose.tx=Math.tanh((pointer.x-r.left-r.width/2)/240)*8*gain;pose.ty=Math.tanh((pointer.y-r.top-r.height/2)/220)*5*gain;wake();
 }
 function blinkOnce(){if(visible()&&!still&&!button.classList.contains('anonymous')){blink=performance.now();wake();}}
 function idleEmote(){
  clearTimeout(emoteTimer);if(!visible()||still)return;
  emoteTimer=setTimeout(()=>{
   if(touch&&!operational()&&!button.classList.contains('anonymous')){
    let next;do{next=Math.floor(Math.random()*pool.length);}while(next===lastEmote);lastEmote=next;
    button.dataset.emote=pool[next];rest();
    clearTimeout(resetTimer);resetTimer=setTimeout(()=>{button.dataset.emote='neutral';blinkOnce();wake();},1700+Math.random()*900);
   }
   idleEmote();
  },2600+Math.random()*1900);
 }
 function cycle(){
  clearTimeout(phaseTimer);clearTimeout(blinkTimer);if(!visible()||still)return;
  if(phase==='follow')phaseTimer=setTimeout(()=>{phase='front';button.dataset.attention='front';rest();cycle();},3200+Math.random()*1800);
  else{
   phaseTimer=setTimeout(()=>{phase='follow';button.dataset.attention='follow';aim();cycle();},1600+Math.random()*800);
   blinkTimer=setTimeout(()=>{blinkOnce();blinkTimer=setTimeout(blinkOnce,340);},1000);
  }
 }
 const move=e=>{
  if(e.pointerType&&e.pointerType!=='mouse'){touch=true;pointer.known=false;rest();return;}
  if(touch){touch=false;button.dataset.emote='neutral';clearTimeout(resetTimer);}
  pointer.x=e.clientX;pointer.y=e.clientY;pointer.known=true;aim();
 };
 window.addEventListener('pointermove',move,{passive:true});
 window.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.pointerType==='pen'){touch=true;pointer.known=false;rest();}},{passive:true});
 document.documentElement.addEventListener('pointerleave',()=>{pointer.known=false;rest();});
 function pause(){cancelAnimationFrame(raf);raf=0;prev=0;for(const timer of [phaseTimer,blinkTimer,emoteTimer,resetTimer])clearTimeout(timer);}
 function resume(){if(visible()){button.dataset.emote='neutral';aim();cycle();idleEmote();}}
 const observer=new IntersectionObserver(()=>{pause();resume();});observer.observe(button);
 document.addEventListener('visibilitychange',()=>{pause();if(!document.hidden){phase='front';rest();resume();}});
 window.addEventListener('pagehide',()=>{disposed=true;pause();observer.disconnect();});
 button.dataset.attention='follow';draw(performance.now());cycle();idleEmote();
 return {gear(value){button.dataset.gear=value;},anonymous(on){button.classList.toggle('anonymous',on);button.dataset.emote='neutral';rest();},expression(value){button.dataset.expression=value;button.dataset.emote='neutral';clearTimeout(resetTimer);rest();}};
}
export function wakeSlider(track,output,onChange){
 const n=36,energy=new Float32Array(n),bars=Array.from({length:n},()=>{const s=document.createElement('span');s.className='wks-bar';track.append(s);return s;});
 let value=0,at=0,down=false,lastX=0,lastT=0,speed=0,raf=0;
 function loop(){if(raf||still)return;let prev=performance.now();function run(now){const dt=Math.min(.05,(now-prev)/1000);prev=now;let live=false;for(let i=0;i<n;i++){energy[i]*=Math.exp(-dt*6.5);if(energy[i]<.002)energy[i]=0;else live=true;bars[i].style.transform=`scaleY(${(1+energy[i]*1.6).toFixed(3)})`;}raf=live?requestAnimationFrame(run):0;}raf=requestAnimationFrame(run);}
 function to(f,s){f=clamp(f,0,1);const a=Math.round(at*(n-1)),b=Math.round(f*(n-1)),push=1-Math.exp(-s/900);at=f;for(let i=Math.min(a,b);i<=Math.max(a,b);i++)energy[i]=Math.max(energy[i],push);value=Math.round(f*100);bars.forEach((bar,i)=>bar.toggleAttribute('data-on',value>0&&i<=Math.round(value/100*(n-1))));track.setAttribute('aria-valuenow',value);output.textContent=value;onChange(value);loop();}
 function frac(x){const r=track.getBoundingClientRect();return(x-r.left)/r.width;}
 track.addEventListener('pointerdown',e=>{track.setPointerCapture(e.pointerId);down=true;lastX=e.clientX;lastT=performance.now();speed=0;to(frac(e.clientX),0);});
 track.addEventListener('pointermove',e=>{if(!down)return;const now=performance.now(),dt=Math.max(.008,(now-lastT)/1000),v=Math.abs(e.clientX-lastX)/dt;speed=speed*.5+v*.5;lastX=e.clientX;lastT=now;to(frac(e.clientX),speed);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(type,()=>{down=false;});
 track.addEventListener('keydown',e=>{const step=e.shiftKey?10:1;let next=null;if(['ArrowRight','ArrowUp'].includes(e.key))next=value+step;if(['ArrowLeft','ArrowDown'].includes(e.key))next=value-step;if(e.key==='Home')next=0;if(e.key==='End')next=100;if(next!==null){e.preventDefault();to(next/100,600);}});
 return {reset(){cancelAnimationFrame(raf);raf=0;energy.fill(0);bars.forEach(b=>b.style.transform='');to(0,0);}};
}
export function slideConfirm(track,onConfirm){
 const grip=track.querySelector('.sld-grip'),say=track.querySelector('.sld-say'),wash=track.querySelector('.sld-wash');let x=0,anchor=0,held=null,done=false,animation=0;
 const travel=()=>Math.max(0,track.clientWidth-56);
 function draw(){const seen=clamp(x,0,travel());grip.style.transform=`translateX(${seen}px)`;grip.style.width=`${48+clamp(anchor-seen,0,travel())}px`;wash.style.width=`${seen+48}px`;say.style.opacity=clamp(1-seen/Math.max(1,travel()*.55),0,1);}
 function settle(target,callback){cancelAnimationFrame(animation);let v=0,prev=performance.now();function frame(now){const dt=Math.min(.025,(now-prev)/1000);prev=now;const k=580,d=2*Math.sqrt(k*.9);v+=((target-x)*k-v*d)/.9*dt;x+=v*dt;draw();if(Math.abs(x-target)+Math.abs(v)>.05&&!still)animation=requestAnimationFrame(frame);else{x=target;draw();callback?.();}}animation=requestAnimationFrame(frame);}
 function finish(){if(done)return;done=true;anchor=travel();x=anchor;track.dataset.done='';grip.setAttribute('aria-label',t('confirmed'));grip.querySelector('.sld-arrow').hidden=true;grip.querySelector('.sld-done').hidden=false;settle(0,onConfirm);}
 function move(e){if(!held||e.pointerId!==held.id)return;const at=e.clientX-track.getBoundingClientRect().left;if(held.grab===null){held.grab=at-x;return;}x=clamp(at-held.grab,0,travel());draw();}
 function release(e){if(!held||e.pointerId!==held.id)return;held=null;track.removeAttribute('data-held');unwatch();if(e.type!=='pointercancel'&&x>=travel())finish();else settle(0);}
 function unwatch(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);}
 track.addEventListener('pointerdown',e=>{if(done)return;cancelAnimationFrame(animation);held={id:e.pointerId,grab:null};track.dataset.held='';try{track.setPointerCapture(e.pointerId);}catch{}window.addEventListener('pointermove',move);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);});
 // Keyboard-equivalent gesture. Clicking never confirms.
 grip.addEventListener('keydown',e=>{if(done)return;if(e.key==='ArrowRight'){e.preventDefault();x=clamp(x+travel()/10,0,travel());draw();}if(e.key==='ArrowLeft'){e.preventDefault();x=clamp(x-travel()/10,0,travel());draw();}if(['Enter',' '].includes(e.key)&&x>=travel()-.5){e.preventDefault();finish();}});
 return {reset(){unwatch();held=null;cancelAnimationFrame(animation);x=anchor=0;done=false;delete track.dataset.done;delete track.dataset.held;grip.setAttribute('aria-label',t('slide'));grip.querySelector('.sld-arrow').hidden=false;grip.querySelector('.sld-done').hidden=true;draw();}};
}
