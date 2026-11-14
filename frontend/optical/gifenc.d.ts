declare module 'gifenc' {
 export function GIFEncoder():{writeFrame:(data:Uint8Array,width:number,height:number,options:Record<string,unknown>)=>void,finish:()=>void,bytes:()=>Uint8Array};
 export function quantize(data:Uint8ClampedArray,colors:number):number[][];
 export function applyPalette(data:Uint8ClampedArray,palette:number[][]):Uint8Array;
}
