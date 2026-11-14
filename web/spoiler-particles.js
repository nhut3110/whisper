import {createDust} from './spoiler-dust.js';
// One viewport canvas for editor, messages and chat; no layout reads per frame.
const groups=new Map(),bursts=new Set();
let canvas,ctx,frame=0,dirty=true,last=0,watching=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const random=seed=>{let n=seed;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}};
function merged(rects){const out=[];for(const r of rects){if(r.width<1||r.height<1)continue;const next={x:r.x,y:r.y,width:r.width,height:r.height};const prev=out.at(-1);if(prev&&Math.abs(prev.y-next.y)<3&&next.x>=prev.x&&next.x-prev.x-prev.width<10){prev.width=Math.max(prev.x+prev.width,next.x+next.width)-prev.x;prev.height=Math.max(prev.height,next.height)}else out.push(next);}return out;}
function ensure(){
 if(canvas)return;canvas=document.createElement('canvas');canvas.className='spoiler-particle-layer';canvas.setAttribute('aria-hidden','true');canvas.inert=true;document.body.append(canvas);ctx=canvas.getContext('2d');
 if(!watching){watching=true;addEventListener('resize',invalidate,{passive:true});document.addEventListener('scroll',invalidate,{passive:true,capture:true});document.addEventListener('visibilitychange',invalidate);reduced.addEventListener('change',invalidate);new MutationObserver(records=>{if(records.some(r=>r.removedNodes.length))invalidate()}).observe(document.body,{childList:true,subtree:true});new MutationObserver(invalidate).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});}
}
function invalidateLocal(){dirty=true;if(!frame&&!document.hidden&&groups.size)frame=requestAnimationFrame(paint);}
function layout(){
 const scale=Math.min(devicePixelRatio||1,3),w=innerWidth,h=innerHeight;
 if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}
 ctx.setTransform(scale,0,0,scale,0,0);
 const plans=[];let area=0;
 for(const [element,g] of groups){
  if(!element.isConnected){groups.delete(element);continue;}
  const style=getComputedStyle(element);
  if(style.visibility==='hidden'||!element.getClientRects().length){g.dust=undefined;g.geometry='';continue;}
  g.color=document.documentElement.dataset.theme==='dark'?'#f3f5f7':'#000000';
  const clip=element.closest('#plaintext')?.getBoundingClientRect(),top=Math.max(0,clip?.top??0),bottom=Math.min(h,clip?.bottom??h);
  const rects=merged(g.rects()).filter(r=>r.y<h&&r.y+r.height>0&&r.x<w&&r.x+r.width>0&&r.y<bottom&&r.y+r.height>top);
  for(const r of rects)area+=r.width*Math.min(r.height,20);
  plans.push({g,rects,top,bottom});
 }
 // Keep reference density for ordinary messages; bound pathological long documents.
 const budget=Math.min(1,8000/Math.max(area/(3.5*3.5)*.8,1));
 for(const {g,rects,top,bottom} of plans){
  const limit=Math.max(1,Math.floor(rects.reduce((a,r)=>a+r.width*r.height,0)/12.25*.8*budget));
  const geometry=JSON.stringify([rects,limit]);
  if(g.geometry!==geometry){g.dust=createDust(rects.map(r=>({...r,y:r.y+1})),random(g.seed),limit);g.geometry=geometry}
  g.clip={top,bottom};
 }

 dirty=false;
}
// CSS ease-out (0,0,.58,1), matching the reference canvas opacity transition.
function fade(age){let lo=0,hi=1;for(let i=0;i<12;i++){const t=(lo+hi)/2,x=3*(1-t)*t*t*.58+t*t*t;if(x<age)lo=t;else hi=t}const t=(lo+hi)/2;return 1-3*(1-t)*t*t-t*t*t}
function paint(now){
 frame=0;if(document.hidden||!canvas||!ctx)return;
 // One painter, no layout reads in the animation loop. Pause offscreen/hidden dust.
 const relayout=dirty;if(dirty)layout();
 const visible=[...groups.values()].filter(g=>g.dust?.points.length);
 if(relayout||now-last>=1000/60-1||reduced.matches){
  const delta=reduced.matches||relayout?0:Math.min((now-last)/16.667,3);last=now;
  ctx.clearRect(0,0,innerWidth,innerHeight);
  for(const g of visible){ctx.save();ctx.beginPath();ctx.rect(0,g.clip.top,innerWidth,g.clip.bottom-g.clip.top);ctx.clip();ctx.fillStyle=g.color;g.dust.draw(ctx,delta);ctx.restore()}
  for(const b of bursts){const age=(now-b.start)/250;if(age>=1){bursts.delete(b);continue}ctx.globalAlpha=fade(age);ctx.fillStyle=b.color;b.dust.draw(ctx,delta);ctx.globalAlpha=1}
 }
 if((visible.length&&!reduced.matches)||bursts.size)frame=requestAnimationFrame(paint);
 if(!groups.size&&!bursts.size){canvas.remove();canvas=ctx=undefined;}

}
function registerLocal(element,rects){
 ensure();groups.set(element,{rects,seed:groups.size*997+431});invalidate();
 let disposed=false;return (burst=false)=>{if(disposed)return;disposed=true;const g=groups.get(element);if(g&&burst&&!reduced.matches&&g.dust?.points.length)bursts.add({...g,start:performance.now()});groups.delete(element);dirty=true;if(!frame)frame=requestAnimationFrame(paint);};
}

// Bundled React/editor and the legacy receiver resolve different module URLs.
// Share the same painter across those imports instead of allocating two canvases.
const shared=globalThis[Symbol.for('whisper.spoiler.particles')]??={register:registerLocal,invalidate:invalidateLocal};
export function registerParticles(element,rects){return shared.register(element,rects);}
export function invalidate(){shared.invalidate();}
