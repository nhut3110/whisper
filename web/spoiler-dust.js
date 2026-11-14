// Geometry-only dust simulation. Reference measurements: Threads web, 2026-11-13.
// No glyphs or concealed text enter the painter. Positions are CSS pixels.
const SPACING=3.5,EDGE=6,TAU=Math.PI*2,q=Math.fround;
export function createDust(rects,rand=Math.random,limit=Infinity){
 const boxes=rects.map(r=>({x:r.x-1,y:r.y-1,w:r.width+2,h:r.height+2}));
 const weights=[];let area=0;for(const b of boxes){area+=b.w*b.h;weights.push(area)}
 const bands=new Map();
 for(const b of boxes)for(let row=Math.floor(b.y/24);row<=Math.floor((b.y+b.h)/24);row++){const band=bands.get(row)||[];band.push(b);bands.set(row,band)}
 const points=[];
 function spawn(p){
  const n=rand()*area,target=boxes[weights.findIndex(w=>n<=w)];
  const columns=Math.max(1,Math.floor(target.w/SPACING));
  p.x=q(target.x+(target.w-columns*SPACING)/2+Math.floor(rand()*columns)*SPACING+SPACING/2+(rand()-.5)*SPACING*.9);
  p.y=q(target.y+target.h*(.15+((rand()+rand())*.5)*.7));
  p.vx=q((rand()-.5)*.4);p.vy=q((rand()*.15+.05)*(p.y<target.y+target.h/2?1:-1));p.r=q(.6+rand()*.5);
 }
 function edge(x,y){let fade=0;for(const b of bands.get(Math.floor(y/24))||[]){if(x<b.x||x>b.x+b.w||y<b.y||y>b.y+b.h)continue;fade=Math.max(fade,Math.min(1,Math.min(x-b.x,b.x+b.w-x,y-b.y,b.y+b.h-y)*(1/EDGE)));if(fade===1)break}return fade}
 for(const b of boxes){
  const cols=Math.floor(b.w/SPACING),rows=Math.floor(b.h/SPACING),left=b.x+(b.w-cols*SPACING)/2;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   if(rand()<.2||points.length>=limit)continue;
   const p={x:q(left+col*SPACING+SPACING/2+(rand()-.5)*SPACING*.9),y:q(b.y+b.h*(.15+((rand()+rand())*.5)*.7)),vx:0,vy:0,r:0};
   p.vx=q((rand()-.5)*.4);p.vy=q((rand()*.15+.05)*(p.y<b.y+b.h/2?1:-1));p.r=q(.6+rand()*.5);
   const age=Math.floor(rand()*200);p.x=q(p.x+p.vx*age);p.y=q(p.y+p.vy*age);points.push(p);
  }
 }
 for(const p of points){p.x=q(p.x+p.vx);p.y=q(p.y+p.vy);if(!edge(p.x,p.y))spawn(p)}
 return {points,draw(ctx,delta=1){
  ctx.beginPath();for(const p of points){p.x=q(p.x+p.vx*delta);p.y=q(p.y+p.vy*delta);const fade=edge(p.x,p.y);if(!fade){spawn(p);continue}
   const radius=p.r*Math.min(1,fade*(.3+(Math.abs(p.vx)+Math.abs(p.vy))*3));
   if(radius>.05){ctx.moveTo(p.x+radius,p.y);ctx.arc(p.x,p.y,radius,0,TAU)}
  }ctx.fill();
 }};
}
