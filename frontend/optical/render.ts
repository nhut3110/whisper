import qrcode from 'qrcode-generator'
import {createNebula} from './nebula'
import {brand} from '../lib/brand'
import {particleMatrix,particlePoint,anchors} from './particle'
export type CodeKind='qr'|'particle'
export function matrix(value:string){const qr=qrcode(0,'H');qr.addData(value,'Byte');qr.make();return qr}
function mark(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,color:string){
 ctx.save();ctx.translate(x,y);ctx.scale(size/64,size/64);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=brand.strokeWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(new Path2D(brand.path));ctx.beginPath();ctx.arc(brand.dot.x,brand.dot.y,brand.dot.radius,0,Math.PI*2);ctx.fill();ctx.restore();
}
export function drawQR(canvas:HTMLCanvasElement,value:string){
 const qr=matrix(value),n=qr.getModuleCount(),cell=8,size=(n+8)*cell;canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#202126';
 const finder=(r:number,c:number)=>(r<8&&c<8)||(r<8&&c>=n-8)||(r>=n-8&&c<8);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c)&&!finder(r,c)){ctx.beginPath();ctx.roundRect((c+4.03)*cell,(r+4.03)*cell,cell*.94,cell*.94,cell*.22);ctx.fill()}
 for(const [r,c] of [[0,0],[0,n-7],[n-7,0]]){
  for(const [inset,width,color] of [[0,7,'#202126'],[1,5,'#fff'],[2,3,'#202126']] as const){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect((c+4+inset)*cell,(r+4+inset)*cell,width*cell,width*cell,cell*.8);ctx.fill()}
 }
 // Small central logo, high error correction, and an untouched 4-module quiet zone.
 const logo=cell*7;ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect((size-logo)/2,(size-logo)/2,logo,logo,cell);ctx.fill();mark(ctx,(size-logo)/2+cell*.55,size/2-logo*.3,logo-cell*1.1,'#202126');canvas.dataset.ready='qr';
}
/** A GPU volume supplies the artwork; a subtle chromatic layer carries the capability. */
export function animateParticle(canvas:HTMLCanvasElement,value:string,options:{light?:boolean,still?:boolean}={}){
 const qr=particleMatrix(value),n=qr.getModuleCount(),size=480;canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d')!,mask=new Uint8Array(size*size*4);
 for(let i=0;i<n*n;i++){
  const p=particlePoint(i,n*n),on=qr.isDark(Math.floor(i/n),i%n),radius=n===37?2.1:1.85;
  for(let y=Math.floor(p.y-radius);y<=Math.ceil(p.y+radius);y++)for(let x=Math.floor(p.x-radius);x<=Math.ceil(p.x+radius);x++){
   const d=Math.hypot(x-p.x,y-p.y);if(d>radius)continue;const at=(y*size+x)*4;mask[at]=on?255:0;mask[at+1]=255;mask[at+3]=255;
  }
 }
 for(const [x,y] of anchors)for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(dx*dx+dy*dy<=9){const at=((y+dy)*size+x+dx)*4;mask[at+2]=mask[at+3]=255}
 let nebula:ReturnType<typeof createNebula>=null;
 try{nebula=createNebula(size,mask,options.light)}catch{nebula=null}
 // A real scannable fallback for devices without GPU support, never a blank canvas.
 const fallback=()=>{ctx.fillStyle=options.light?'#eef2fa':'#02070e';ctx.fillRect(0,0,size,size);for(let i=0;i<size*size;i++)if(mask[i*4+3]){ctx.fillStyle=mask[i*4+2]?'rgb(115,62,184)':mask[i*4]?'rgb(60,160,180)':'rgb(60,85,180)';ctx.fillRect(i%size,Math.floor(i/size),1,1)}};
 let frame=0,last=-Infinity,stopped=false;const reduced=options.still||matchMedia('(prefers-reduced-motion: reduce)').matches,start=performance.now();
 function paint(time:number){if(stopped)return;if(!document.hidden&&time-last>=1000/30){last=time;if(nebula){if(nebula.draw(reduced?1.4:(time-start)/1000+1.4)){ctx.drawImage(nebula.canvas,0,0)}else{nebula.dispose();nebula=null;canvas.dataset.renderer='fallback';fallback()}}else fallback()}if(!reduced&&nebula&&!document.hidden)frame=requestAnimationFrame(paint)}
 const visibility=()=>{cancelAnimationFrame(frame);if(!document.hidden)paint(performance.now()+40)};
 document.addEventListener('visibilitychange',visibility);paint(start);canvas.dataset.renderer=nebula?'webgl':'fallback';canvas.dataset.ready='particle';
 const dispose=()=>{stopped=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);nebula?.dispose();ctx.clearRect(0,0,size,size)};
 return Object.assign(dispose,{draw:(time:number)=>{if(nebula?.draw(time))ctx.drawImage(nebula.canvas,0,0)}});
}
