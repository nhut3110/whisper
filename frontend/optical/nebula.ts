/** Local GPU point volume. No textures, models or remote services. */
export function createNebula(size:number,mask:Uint8Array,light=false){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
 if(!gl)return null;
 const fail=(message:string):never=>{gl.getExtension('WEBGL_lose_context')?.loseContext();throw new Error(message)};
 const shaders:WebGLShader[]=[],programs:WebGLProgram[]=[],buffers:WebGLBuffer[]=[],textures:WebGLTexture[]=[];
 function program(vertex:string,fragment:string){
  const compile=(type:number,source:string)=>{const shader=gl!.createShader(type)!;shaders.push(shader);gl!.shaderSource(shader,source);gl!.compileShader(shader);if(!gl!.getShaderParameter(shader,gl!.COMPILE_STATUS))fail('Nebula shader compilation failed');return shader};
  const p=gl!.createProgram()!;programs.push(p);gl!.attachShader(p,compile(gl!.VERTEX_SHADER,vertex));gl!.attachShader(p,compile(gl!.FRAGMENT_SHADER,fragment));gl!.linkProgram(p);if(!gl!.getProgramParameter(p,gl!.LINK_STATUS))fail('Nebula shader link failed');return p;
 }
 const particles=program(`
 attribute vec4 aSeed;
 uniform float uTime;
 uniform float uSize;
 varying vec3 vColor;
 varying float vAlpha;
 void main(){
  float radius=pow(aSeed.z,.62);
  float turn=uTime*.055;
  bool bulge=aSeed.w<.14;
  bool haze=aSeed.w>.55;
  vec3 p;
  if(bulge||haze){
   float latitude=aSeed.y*2.-1.;float angle=aSeed.x*6.2831853+turn;
   p=vec3(cos(angle)*sqrt(1.-latitude*latitude),latitude,sin(angle)*sqrt(1.-latitude*latitude))*radius*(bulge?.28:1.);
  }else{
   float arm=floor(aSeed.x*3.);
   float scatter=(aSeed.y-.5)*(1.1+radius*.8)+sin(aSeed.x*70.)*.14;
   float angle=arm*2.0943951+radius*5.4+turn+scatter;
   p=vec3(cos(angle)*radius,(aSeed.w-.36)*.36*(1.-radius*.65),sin(angle)*radius);
   p.y+=sin(radius*11.+arm+uTime*.11)*.025;
  }
  // A tilted stellar disc with a real spherical bulge and differential arm motion.
  float tilt=.84;
  p.yz=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*p.yz;
  float depth=(p.z+1.)*.5;
  float perspective=1./(1.07-p.z*.10);
  vec2 screen=p.xy*perspective*.82;
  float orient=.32;screen=mat2(cos(orient),-sin(orient),sin(orient),cos(orient))*screen;
  gl_Position=vec4(screen,0.,1.);
  float edge=1.-smoothstep(.78,1.07,radius);
  vAlpha=(bulge?.12:haze?.18:.19+depth*.22)*edge;
  vec3 cold=vec3(.13,.43,.83),pearl=vec3(.65,.84,1.);
  vColor=bulge?vec3(.9,.87,.81):mix(cold,pearl,depth)*1.2;
  gl_PointSize=(1.+aSeed.y*1.7)*(bulge?1.:.75+depth*.55)*1.3*uSize/480.;
 }`, `precision mediump float;
 varying vec3 vColor;varying float vAlpha;
 void main(){float r=length(gl_PointCoord-.5)*2.;float soft=exp(-r*r*3.5);gl_FragColor=vec4(vColor,vAlpha*soft);}`);
 const composite=program(`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`,`
 precision mediump float;varying vec2 vUV;uniform sampler2D uScene;uniform sampler2D uCode;uniform float uLight;
 void main(){
  vec3 scene=texture2D(uScene,vUV).rgb;
  vec2 p=vUV-.5;
  float halo=exp(-dot(p,p)*19.);
  scene+=vec3(.018,.065,.105)*halo;
  scene=mix(scene,vec3(.94,.95,.98)-scene*.65,uLight);
  vec4 code=texture2D(uCode,vec2(vUV.x,1.-vUV.y));
  if(code.b>.5){
   // Dust-colour registration texture, blended into the light, never four bright dots.
   scene.r=max(scene.r,.45);scene.b=max(scene.b,.72);scene.g=max(0.,(scene.r+scene.b)*.5-.34);
  }
  else if(code.g>.01){
   // Encode in chromatic difference, so the moving luminance volume remains visible.
   float neutral=(scene.r+scene.b)*.5;
   scene.g=mix(scene.g,clamp(neutral+(code.r>.5?.18:-.18),0.,1.),code.g);
  }
  gl_FragColor=vec4(scene,1.);
 }`);
 let seed=91731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const count=72000,data=new Float32Array(count*4);for(let i=0;i<data.length;i++)data[i]=random();
 const points=gl.createBuffer()!;buffers.push(points);gl.bindBuffer(gl.ARRAY_BUFFER,points);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
 const quad=gl.createBuffer()!;buffers.push(quad);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 function texture(pixels:Uint8Array|null){const t=gl!.createTexture()!;textures.push(t);gl!.bindTexture(gl!.TEXTURE_2D,t);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,size,size,0,gl!.RGBA,gl!.UNSIGNED_BYTE,pixels);return t}
 const scene=texture(null),code=texture(mask),framebuffer=gl.createFramebuffer()!;gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,scene,0);
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)fail('Nebula framebuffer unavailable');
 const seedLocation=gl.getAttribLocation(particles,'aSeed'),positionLocation=gl.getAttribLocation(composite,'aPosition');
 const timeLocation=gl.getUniformLocation(particles,'uTime'),sizeLocation=gl.getUniformLocation(particles,'uSize');
 function draw(time:number){
  if(gl!.isContextLost())return false;
  gl!.viewport(0,0,size,size);gl!.bindFramebuffer(gl!.FRAMEBUFFER,framebuffer);gl!.clearColor(0,0,0,1);gl!.clear(gl!.COLOR_BUFFER_BIT);
  gl!.useProgram(particles);gl!.bindBuffer(gl!.ARRAY_BUFFER,points);gl!.enableVertexAttribArray(seedLocation);gl!.vertexAttribPointer(seedLocation,4,gl!.FLOAT,false,0,0);gl!.uniform1f(timeLocation,time);gl!.uniform1f(sizeLocation,size);
  gl!.enable(gl!.BLEND);gl!.blendFunc(gl!.SRC_ALPHA,gl!.ONE);gl!.drawArrays(gl!.POINTS,0,count);gl!.disable(gl!.BLEND);gl!.disableVertexAttribArray(seedLocation);
  gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);gl!.useProgram(composite);gl!.uniform1f(gl!.getUniformLocation(composite,'uLight'),light?1:0);gl!.bindBuffer(gl!.ARRAY_BUFFER,quad);gl!.enableVertexAttribArray(positionLocation);gl!.vertexAttribPointer(positionLocation,2,gl!.FLOAT,false,0,0);
  gl!.activeTexture(gl!.TEXTURE0);gl!.bindTexture(gl!.TEXTURE_2D,scene);gl!.uniform1i(gl!.getUniformLocation(composite,'uScene'),0);gl!.activeTexture(gl!.TEXTURE1);gl!.bindTexture(gl!.TEXTURE_2D,code);gl!.uniform1i(gl!.getUniformLocation(composite,'uCode'),1);gl!.drawArrays(gl!.TRIANGLE_STRIP,0,4);gl!.disableVertexAttribArray(positionLocation);return true;
 }
 return {canvas,draw,dispose(){gl.deleteFramebuffer(framebuffer);for(const t of textures)gl.deleteTexture(t);for(const b of buffers)gl.deleteBuffer(b);for(const p of programs)gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);gl.getExtension('WEBGL_lose_context')?.loseContext()}};
}
