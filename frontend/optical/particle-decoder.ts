import jsQR from 'jsqr'
import {particlePoint,anchors} from './particle.ts'
type Point={x:number,y:number}
function stars(data:Uint8ClampedArray,w:number,h:number){
 const score=(i:number)=>(data[i*4]+data[i*4+2])*.5-data[i*4+1],threshold=58,seen=new Uint8Array(w*h),points:Point[]=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const start=y*w+x;if(seen[start]||score(start)<threshold)continue;
  const queue=[start];seen[start]=1;let at=0,sx=0,sy=0,weight=0,minx=x,maxx=x,miny=y,maxy=y;
  while(at<queue.length){const p=queue[at++],px=p%w,py=Math.floor(p/w);const brightness=score(p)-threshold+1;sx+=px*brightness;sy+=py*brightness;weight+=brightness;minx=Math.min(minx,px);maxx=Math.max(maxx,px);miny=Math.min(miny,py);maxy=Math.max(maxy,py);
   for(const [nx,ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]])if(nx>=0&&nx<w&&ny>=0&&ny<h){const j=ny*w+nx;if(!seen[j]&&score(j)>=threshold){seen[j]=1;queue.push(j)}}
  }
  if(queue.length>=7&&queue.length<=500&&maxx-minx<35&&maxy-miny<35)points.push({x:sx/weight,y:sy/weight});
 }
 return points.length<=6?points:[];
}
function transform(p:Point[]){
 const [p0,p1,p2,p3]=p,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y,den=dx1*dy2-dx2*dy1;
 if(Math.abs(den)<1)return null;
 const g=(dx3*dy2-dx2*dy3)/den,h=(dx1*dy3-dx3*dy1)/den,a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;
 return (x:number,y:number)=>{const u=(x-anchors[0][0])/(anchors[1][0]-anchors[0][0]),v=(y-anchors[0][1])/(anchors[3][1]-anchors[0][1]),k=g*u+h*v+1;return {x:(a*u+b*v+p0.x)/k,y:(d*u+e*v+p0.y)/k}};
}
function recover(data:Uint8ClampedArray,w:number,h:number,points:Point[],n:number){
 const project=transform(points);if(!project)return null;const samples:number[]=[];
 for(let i=0;i<n*n;i++){const p=particlePoint(i,n*n),q=project(p.x,p.y),x=Math.floor(q.x),y=Math.floor(q.y);if(x<1||y<1||x>=w-1||y>=h-1)return null;
  const chroma=(x:number,y:number)=>{const at=(y*w+x)*4;return data[at+1]-(data[at]+data[at+2])*.5};const fx=q.x-x,fy=q.y-y;samples.push(chroma(x,y)*(1-fx)*(1-fy)+chroma(x+1,y)*fx*(1-fy)+chroma(x,y+1)*(1-fx)*fy+chroma(x+1,y+1)*fx*fy);
 }
 const sorted=[...samples].sort((a,b)=>a-b),lo=sorted[Math.floor(sorted.length*.15)],hi=sorted[Math.floor(sorted.length*.85)];if(hi-lo<25)return null;const threshold=(lo+hi)/2,bits=samples.map(v=>v>threshold);
 let matched=0,total=0;for(const [row,col] of [[0,0],[0,n-7],[n-7,0]])for(let r=0;r<7;r++)for(let c=0;c<7;c++){const expected=r===0||c===0||r===6||c===6||(r>=2&&r<=4&&c>=2&&c<=4);if(bits[(row+r)*n+col+c]===expected)matched++;total++}if(matched/total<.83)return null;
 const cell=4,size=(n+8)*cell,pixels=new Uint8ClampedArray(size*size*4).fill(255);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(bits[r*n+c])for(let dy=0;dy<cell;dy++)for(let dx=0;dx<cell;dx++){const i=(((r+4)*cell+dy)*size+(c+4)*cell+dx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0}
 const value=jsQR(pixels,size,size,{inversionAttempts:'dontInvert'})?.data;return value&&/^[SR][A-Za-z0-9_-]+$/.test(value)?value:null;
}
export function decodeParticle(data:Uint8ClampedArray,w:number,h:number){
 const points=stars(data,w,h);if(points.length<4)return null;
 for(let a=0;a<points.length-3;a++)for(let b=a+1;b<points.length-2;b++)for(let c=b+1;c<points.length-1;c++)for(let d=c+1;d<points.length;d++){
  const group=[points[a],points[b],points[c],points[d]],center={x:group.reduce((s,p)=>s+p.x,0)/4,y:group.reduce((s,p)=>s+p.y,0)/4};group.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  if(group.some((p,i)=>Math.hypot(p.x-group[(i+1)%4].x,p.y-group[(i+1)%4].y)<44))continue;
  for(let rotation=0;rotation<4;rotation++)for(const mirror of [false,true]){
   const quad=Array.from({length:4},(_,i)=>group[(rotation+(mirror?4-i:i))%4]);
   // JPEG can shift a dust patch centroid by a fraction of a pixel. Try a
   // least-squares affine/similarity fit as well as the full perspective fit.
   const center={x:quad.reduce((s,p)=>s+p.x,0)/4,y:quad.reduce((s,p)=>s+p.y,0)/4};
   const u={x:(quad[1].x+quad[2].x-quad[0].x-quad[3].x)/4,y:(quad[1].y+quad[2].y-quad[0].y-quad[3].y)/4};
   const v={x:(quad[2].x+quad[3].x-quad[0].x-quad[1].x)/4,y:(quad[2].y+quad[3].y-quad[0].y-quad[1].y)/4};
   const corners=(u:Point,v:Point)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:center.x+a*u.x+b*v.x,y:center.y+a*u.y+b*v.y}));
   const sign=u.x*v.y-u.y*v.x>0?1:-1,axis={x:(u.x+sign*v.y)/2,y:(u.y-sign*v.x)/2};
   for(const fit of [quad,corners(u,v),corners(axis,{x:-sign*axis.y,y:sign*axis.x})])for(const n of [37,53]){const value=recover(data,w,h,fit,n);if(value)return value}
  }
 }
 return null;
}
