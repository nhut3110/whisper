import {decodeFrame} from './decoder'
self.onmessage=(event:MessageEvent<{data:Uint8ClampedArray,width:number,height:number}>)=>{
 const {data,width,height}=event.data;
 try{self.postMessage({value:decodeFrame(data,width,height)})}catch{self.postMessage({value:null})}
};
