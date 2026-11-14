import {decodeFrame} from '../../frontend/optical/decoder.ts';
import sharp from 'sharp';
import {test,expect} from '@playwright/test';
const demo=origin=>origin+'/s/'+'a'.repeat(16)+'#'+'A'.repeat(22);
async function share(page,url){await page.evaluate(url=>document.dispatchEvent(new CustomEvent('whisper:optical',{detail:{mode:'share',url}})),url);await expect(page.locator('.optical-art canvas')).toBeVisible()}
async function cameraFromImage(page,png){
 await page.evaluate(png=>{navigator.mediaDevices.getUserMedia=async()=>{const image=new Image(),objectURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0))],{type:'image/png'}));image.src=objectURL;await image.decode();URL.revokeObjectURL(objectURL);const canvas=document.createElement('canvas');canvas.width=canvas.height=480;const draw=()=>canvas.getContext('2d').drawImage(image,0,0,480,480);draw();const stream=canvas.captureStream(10);const tick=setInterval(draw,100);const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(tick);stop()};window.opticalTestStream=stream;return stream}},png);
}
for(const kind of ['QR','Particle'])test(`${kind} code decodes through video and worker without consuming the message; camera stops`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');
 expect(requests.some(url=>/panel-.*\.js|decoder.worker/.test(url))).toBe(false);
 await page.locator('#message').fill('Optical share test');await page.locator('#create').click();await expect(page.locator('#challenge-label')).not.toHaveText('Đang chuẩn bị…');await page.waitForTimeout(550);const target=Number((await page.locator('#challenge-label').textContent()).match(/\d+/)[0]),r=await page.locator('#wake-track').boundingBox();await page.mouse.move(r.x,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*target/100,r.y+r.height/2,{steps:8});await page.mouse.up();await page.locator('#settings-done').click();await expect(page.locator('#created')).toBeVisible();const url=await page.locator('#share-link').inputValue();requests.length=0;await page.locator('#show-code').click();await expect(page.locator('.optical-art canvas')).toBeVisible();
 if(kind==='Particle')await page.getByRole('button',{name:'Tinh vân',exact:true}).click();
 await expect(page.locator('.optical-art canvas')).toHaveAttribute('data-ready',kind.toLowerCase());
 const png=await page.locator('.optical-art canvas').evaluate(canvas=>canvas.toDataURL());await page.screenshot({path:`coverage/manual/2026-11-13-optical/${kind}-desktop.png`});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.optical-panel')).toBeInViewport();await page.screenshot({path:`coverage/manual/2026-11-13-optical/${kind}-${width}.png`})}
 await page.keyboard.press('Escape');await expect(page.locator('.optical-panel')).toHaveCount(0);await cameraFromImage(page,png);
 await page.locator('#scan-code').click();await page.getByRole('button',{name:'Mở camera',exact:true}).click();await expect(page.locator('.optical-status')).toHaveText('Đã tìm thấy link Whisper',{timeout:12000});
 expect(await page.evaluate(()=>window.opticalTestStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);expect(requests.filter(url=>/\/api\/messages/.test(url))).toEqual([]);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Mở',exact:true}).click();await expect(page.locator('#receive')).toBeVisible();await page.locator('#create').click();await page.locator('#open').click();await expect(page.locator('#plaintext')).toHaveText('Optical share test');
});
test('camera denied is recoverable, dismiss stops stream and external links never navigate',async({page})=>{
 await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')}});
 await page.locator('#scan-code').click();await page.getByRole('button',{name:'Mở camera',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Chưa mở được camera');await page.keyboard.press('Escape');
 await share(page,demo(new URL(page.url()).origin));await expect(page.locator('canvas[aria-label="Whisper QR"]')).toHaveAttribute('data-ready','qr');const png=await page.locator('canvas[aria-label="Whisper QR"]').evaluate(canvas=>canvas.toDataURL());await page.keyboard.press('Escape');await cameraFromImage(page,png);
 // External share payloads cannot even be rendered by our share entry point.
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('whisper:optical',{detail:{mode:'share',url:'https://evil.example/'}})));await expect(page.locator('.optical-panel')).toHaveCount(0);
 await page.locator('#scan-code').click();await page.getByRole('button',{name:'Mở camera',exact:true}).click();await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>!window.opticalTestStream||window.opticalTestStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
});

for(const kind of ['QR','Particle'])test(`${kind} supports room invites after JPEG compression and rotation`,async({page})=>{
 await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');
 const origin=new URL(page.url()).origin,url=origin+'/?mode=chat#r='+'A'.repeat(43)+'&a='+'B'.repeat(42)+'A&k='+'C'.repeat(42)+'A';
 await share(page,url);if(kind==='Particle')await page.getByRole('button',{name:'Tinh vân',exact:true}).click();await expect(page.locator('.optical-art canvas')).toHaveAttribute('data-ready',kind.toLowerCase());
 const png=await page.locator('.optical-art canvas').evaluate(canvas=>canvas.toDataURL());
 const image=await sharp(Buffer.from(png.split(',')[1],'base64')).resize(480,480).rotate(90).jpeg({quality:85}).png().toBuffer();
 await page.keyboard.press('Escape');await cameraFromImage(page,'data:image/png;base64,'+image.toString('base64'));await page.locator('#scan-code').click();await page.getByRole('button',{name:'Mở camera',exact:true}).click();await expect(page.locator('.optical-status')).toHaveText('Đã tìm thấy link Whisper');
 expect(await page.evaluate(()=>window.opticalTestStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);await page.keyboard.press('Escape');
});

test('nebula is animated on the GPU and its code survives later compressed frames',async({page})=>{
 await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');const origin=new URL(page.url()).origin;
 await share(page,origin+'/?mode=chat#r='+'A'.repeat(43)+'&a='+'B'.repeat(42)+'A&k='+'C'.repeat(42)+'A');await page.getByRole('button',{name:'Tinh vân',exact:true}).click();
 const canvas=page.locator('.optical-art canvas');await expect(canvas).toHaveAttribute('data-renderer','webgl');
 let previous='';
 for(let i=0;i<4;i++){
  await page.waitForTimeout(600);const png=await canvas.evaluate(c=>c.toDataURL());expect(png).not.toBe(previous);previous=png;
  const raw=await sharp(Buffer.from(png.split(',')[1],'base64')).jpeg({quality:85}).toBuffer();const {data,info}=await sharp(raw).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(decodeFrame(new Uint8ClampedArray(data),info.width,info.height)).toBe('R'+'A'.repeat(43)+'B'.repeat(42)+'A'+'C'.repeat(42)+'A');
 }
 await page.keyboard.press('Escape');
});

test('no-WebGL fallback remains scannable and reduced motion keeps the volume still',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('#root')).not.toHaveAttribute('inert','');
 const url=demo(new URL(page.url()).origin);await share(page,url);await page.getByRole('button',{name:'Tinh vân',exact:true}).click();const canvas=page.locator('.optical-art canvas');await expect(canvas).toHaveAttribute('data-ready','particle');const first=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(300);expect(await canvas.evaluate(c=>c.toDataURL())).toBe(first);await page.keyboard.press('Escape');
 await page.evaluate(()=>{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl')return null;return getContext.call(this,type,...args)}});
 await share(page,url);await page.getByRole('button',{name:'Tinh vân',exact:true}).click();await expect(canvas).toHaveAttribute('data-renderer','fallback');
 const png=await canvas.evaluate(c=>c.toDataURL());const {data,info}=await sharp(Buffer.from(png.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect(decodeFrame(new Uint8ClampedArray(data),info.width,info.height)).toBe('S'+'a'.repeat(16)+'A'.repeat(22));await page.keyboard.press('Escape');
});
