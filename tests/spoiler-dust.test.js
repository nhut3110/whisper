import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDust} from '../web/spoiler-dust.js';
const seeded=()=>{let n=431;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)};
test('geometry dust remains bounded and has the reference-sized moving particles',()=>{
 const dust=createDust([{x:0,y:2,width:290,height:18}],seeded());
 assert.ok(dust.points.length>250&&dust.points.length<400);
 let arcs=0;const ctx={beginPath(){},moveTo(){},arc(x,y,r){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(r>0&&r<=1.1);arcs++},fill(){}};
 const start=dust.points.map(p=>[p.x,p.y]);
 for(let i=0;i<1000;i++)dust.draw(ctx,1);
 assert.ok(arcs>100000);assert.notDeepEqual(dust.points.map(p=>[p.x,p.y]),start);
 for(const p of dust.points)assert.ok(p.x>=-1&&p.x<=291&&p.y>=1&&p.y<=21);
});
test('zero delta gives a stable reduced-motion frame and a hard particle cap',()=>{
 const dust=createDust([{x:0,y:0,width:10000,height:20}],seeded(),80);
 assert.equal(dust.points.length,80);
 const frame=()=>{const arcs=[];dust.draw({beginPath(){},moveTo(){},arc(...v){arcs.push(v)},fill(){}},0);return arcs};
 assert.deepEqual(frame(),frame());
 const empty=createDust([]);assert.equal(empty.points.length,0);empty.draw({beginPath(){},fill(){}},1);
});
