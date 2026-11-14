import jsQR from 'jsqr'
import {decodeParticle} from './particle-decoder.ts'
export function decodeFrame(data:Uint8ClampedArray,width:number,height:number):string|null{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<21||height<21||width>640||height>640||data.length!==width*height*4)return null;
 const green=new Uint8ClampedArray(data.length);for(let i=0;i<data.length;i+=4){green[i]=green[i+1]=green[i+2]=data[i+1];green[i+3]=255}
 const particle=decodeParticle(data,width,height);if(particle)return particle;
 return jsQR(green,width,height,{inversionAttempts:'attemptBoth'})?.data||jsQR(data,width,height,{inversionAttempts:'attemptBoth'})?.data||null;
}
