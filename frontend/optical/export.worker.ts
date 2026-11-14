declare const self:{onmessage:((event:MessageEvent)=>void)|null,postMessage:(message:unknown,transfer?:Transferable[])=>void}
import {GIFEncoder,quantize,applyPalette} from 'gifenc'
let gif=GIFEncoder()
self.onmessage=({data})=>{
 try{
  if(data.reset){gif=GIFEncoder();return}
  const rgba=new Uint8ClampedArray(data.pixels),palette=quantize(rgba,256),index=applyPalette(rgba,palette);
  gif.writeFrame(index,data.size,data.size,{palette,delay:100,repeat:0});
  if(data.last){gif.finish();const bytes=gif.bytes();self.postMessage({done:bytes},[bytes.buffer])}else self.postMessage({next:true});
 }catch{self.postMessage({error:true})}
}
