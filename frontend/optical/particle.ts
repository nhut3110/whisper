import qrcode from 'qrcode-generator'
import {shareURL} from './protocol.ts'
export const PARTICLE_SIZE=480
export function particlePayload(value:string){
 const url=new URL(value)
 if(url.pathname.startsWith('/s/'))return 'S'+url.pathname.slice(3)+url.hash.slice(1)
 const p=new URLSearchParams(url.hash.slice(1));return 'R'+['r','a','k'].map(k=>p.get(k)).join('')
}
export function particleURL(value:string,origin:string){
 if(/^S[A-Za-z0-9_-]{38}$/.test(value))return shareURL(origin+'/s/'+value.slice(1,17)+'#'+value.slice(17),origin)
 if(/^R[A-Za-z0-9_-]{129}$/.test(value))return shareURL(origin+'/?mode=chat#r='+value.slice(1,44)+'&a='+value.slice(44,87)+'&k='+value.slice(87),origin)
 return null
}
export function particleMatrix(value:string){const payload=particlePayload(value);const qr=qrcode(payload[0]==='S'?5:9,payload[0]==='S'?'H':'Q');qr.addData(payload,'Byte');qr.make();return qr}
/** Deterministic blue-noise sites: no visible lattice or spiral, shared with the decoder. */
const clouds=new Map<number,Array<{x:number,y:number}>>()
export function particlePoint(index:number,count:number){
 let points=clouds.get(count);
 if(!points){
  points=[];let seed=count*7919;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const distance=count<2000?5.7:4.1,buckets=new Map<string,Array<{x:number,y:number}>>();
  for(let attempt=0;points.length<count&&attempt<500000;attempt++){
   const x=(random()*2-1)*187,y=(random()*2-1)*177,a=Math.atan2(y,x),edge=1+.045*Math.sin(a*3)+.025*Math.cos(a*5);
   if((x/178)**2+(y/166)**2>edge*edge)continue;
   const bx=Math.floor(x/distance),by=Math.floor(y/distance);let occupied=false;
   for(let dx=-1;dx<=1&&!occupied;dx++)for(let dy=-1;dy<=1&&!occupied;dy++)for(const p of buckets.get((bx+dx)+','+(by+dy))||[])if((p.x-x)**2+(p.y-y)**2<distance*distance){occupied=true;break}
   if(occupied)continue;
   const p={x,y},key=bx+','+by,bucket=buckets.get(key)||[];bucket.push(p);buckets.set(key,bucket);points.push(p);
  }
  if(points.length!==count)throw new Error('Particle cloud capacity exceeded');
  points=points.map(p=>({x:p.x*.85+240,y:p.y*.85+240}));clouds.set(count,points);
 }
 return points[index];
}
export const anchors=[[165,165],[315,165],[315,315],[165,315]] as const
