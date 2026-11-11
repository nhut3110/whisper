import {t,locale,duration,initLanguage,chatter} from '/i18n.js';
import {watcher,wakeSlider,slideConfirm} from '/interactions.js';
import {seal,sealBytes,unsealBytes,TEXT_LIMIT,randomToken,randomPin,readLink,newShortLink,deriveShortLink} from '/crypto.js';
const $=id=>document.getElementById(id),prefix='hush:rich:v1\n';
let secrets=null,closed=false,rich=null,readText='',readHTML=null,selectedText='';
let audio=null,recorder=null,preview=null,receivedPlayer=null,mode='text',voicePhase='idle',currentView='compose',metadata=null;
async function audioTools(){if(!audio)audio=await import('/audio.js');return audio;}
const sections=['compose','created','receive','reading','destroy','ended'];
function show(id){currentView=id;if(id!=='compose'){stopVoice();document.body.classList.remove('audio-compose');$('share-dock').classList.remove('voice-mode');}companion(id);$('compose-actions').hidden=id!=='compose';if($('settings').open)$('settings').close();sections.forEach(s=>$(s).hidden=s!==id);status('');}
let statusTimer;
function status(text){clearTimeout(statusTimer);$('status').textContent=text?t(text):'';if(text)statusTimer=setTimeout(()=>$('status').textContent='',4500);}
async function richTools(){if(!rich)rich=await import('/rich.js');return rich;}
async function api(path,data){
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',credentials:'omit',redirect:'error'});
  if(!res.ok){let message='network';try{const data=await res.json();message=serverError(data.error,res.status);}catch{}const e=new Error(message);e.status=res.status;throw e;}
  return res.status===204?null:res.json();
}
function busy(button,value){button.disabled=value;button.setAttribute('aria-busy',String(value));}
function forget(){stopVoice(true);receivedPlayer?.destroy();receivedPlayer=null;clearInterval(expiryTimer);metadata=null;secrets=null;readText='';readHTML=null;selectedText='';$('plaintext').replaceChildren();$('rich-editor').replaceChildren();$('message').value='';$('share-link').value='';$('revoke-link').value='';$('generated-pin').textContent='';$('pin').value='';$('copy-selection').hidden=true;$('copy-all').hidden=false;$('received-audio').hidden=true;$('plaintext').hidden=false;closed=true;}
function ended(note){forget();show('ended');$('ended-note').textContent=t(note);}
function draft(){
 if(!$('rich-mode').checked)return $('message').value;
 if(!$('rich-editor').innerText.trim())throw new Error('textLimit');
 return prefix+JSON.stringify({html:rich.clean($('rich-editor').innerHTML)});
}
function count(){let text='';try{text=draft();}catch{}$('count').textContent=mode==='voice'?t('audioLimit'):`${new Intl.NumberFormat(locale).format(new TextEncoder().encode(text).length)} / 256 KiB`;status('');}
async function copy(text,html=null){
 try{
  if(html&&typeof ClipboardItem!=='undefined'&&navigator.clipboard.write){
   await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);
  }else await navigator.clipboard.writeText(text);
  status('copied');
 }catch{status('copyFailed');}
}
function openSettings(){stopVoice();preview?.pause();$('settings').showModal();count();beginVerification();}
$('create').addEventListener('click',()=>{if(mode==='text'&&currentView==='compose')openSettings();});
$('settings-done').addEventListener('click',()=>{if(challengeValue===challenge?.target)completeVerification(challengeValue);});
$('settings-close').addEventListener('click',()=>$('settings').close());
$('settings').addEventListener('click',e=>{if(e.target!==$('settings'))return;const r=$('settings').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('settings').close();});
$('settings').addEventListener('close',()=>{challengeGeneration++;challenge=null;wake.reset();slide.reset();face.anonymous(currentView!=='compose');resumeBubbles();});
$('ttl').addEventListener('change',()=>{const custom=$('ttl').value==='custom';$('custom-expiry').hidden=!custom;$('ttl-minutes').required=custom;});
$('message').addEventListener('input',count);
$('rich-editor').addEventListener('input',count);
$('rich-mode').addEventListener('change',async()=>{
 const on=$('rich-mode').checked;busy($('rich-mode'),true);
 try{
  if(on){const tools=await richTools();$('rich-editor').innerHTML=tools.fromText($('message').value);}
  else $('message').value=$('rich-editor').innerText;
  $('message').hidden=on;$('message').required=!on;$('rich-editor').hidden=!on;$('rich-toolbar').hidden=!on;
  $('message-label').htmlFor=on?'rich-editor':'message';
  (on?$('rich-editor'):$('message')).focus();count();
 }catch{ $('rich-mode').checked=false;status('richFailed'); }
 finally{busy($('rich-mode'),false);}
});
for(const button of document.querySelectorAll('[data-command]')){
 button.addEventListener('pointerdown',e=>e.preventDefault());
 button.addEventListener('click',()=>{$('rich-editor').focus();document.execCommand(button.dataset.command,false);count();});
}
$('rich-editor').addEventListener('paste',async e=>{
 e.preventDefault();const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain');
 // The optional module is already loaded before this editor is shown. Never insert raw clipboard HTML.
 document.execCommand('insertHTML',false,html?rich.clean(html):rich.fromText(text));count();
});
$('rich-editor').addEventListener('drop',e=>e.preventDefault());
$('copy-draft').addEventListener('click',()=>{if($('rich-mode').checked)copy($('rich-editor').innerText,rich.clean($('rich-editor').innerHTML));else copy($('message').value);});
function expirySeconds(){
 const ttl=$('ttl').value==='custom'?Number($('ttl-minutes').value)*60:Number($('ttl').value);
 if(!Number.isInteger(ttl)||ttl<60||ttl>604800){throw new Error('expiryError');}return ttl;
}
$('compose-form').addEventListener('submit',async e=>{
 e.preventDefault();openSettings();
});
async function createMessage(verification){
 busy($('create'),true);status('');
 try{
  const ttl=expirySeconds();
  validateDraft();
  const short=await newShortLink(),encrypted=mode==='voice'?await sealBytes(await audio.packClip(recorder.getClip()),short.key):await seal(draft(),short.key),access=short.access,revoke=randomToken(),pin=$('use-pin').checked?randomPin():null;
  const result=await api('/api/messages',{id:short.id,ciphertext:encrypted.ciphertext,iv:encrypted.iv,access,revoke,ttl,burn:$('burn').checked,pin,verification});
  $('share-link').value=`${location.origin}/#${short.seed}`;
  $('revoke-link').value=`${location.origin}/revoke/${result.id}#r=${revoke}`;
  $('pin-result').hidden=!pin;$('generated-pin').textContent=pin||'';
  $('expiry').textContent=($('burn').checked?t('oneRead')+' · ':'')+t('expiresAt',{date:new Date(result.expires_at*1000).toLocaleString(locale)});
  $('message').value='';$('rich-editor').replaceChildren();stopVoice(true);show('created');
 }catch(err){status(err.message);if($('settings').open)beginVerification();}finally{busy($('create'),false);$('create').disabled=$('compose').hidden;}
}
for(const [button,field] of [['copy-link','share-link'],['copy-pin','generated-pin'],['copy-revoke','revoke-link']])$(button).addEventListener('click',()=>copy($(field).value||$(field).textContent));
function addBlockCopy(block,text,html){
 const button=document.createElement('button');button.type='button';button.className='block-copy';button.setAttribute('aria-label',t('copyPart'));button.title=t('copyPart');
 // Static local icon only. No user-controlled HTML enters this path.
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 5V3H3v13h2"/></svg>';
 button.addEventListener('click',()=>copy(text,html));block.classList.add('message-block');block.append(button);
}
async function renderMessage(text){
 const root=$('plaintext');root.replaceChildren();root.classList.toggle('plain',!text.startsWith(prefix));
 if(text.startsWith(prefix)){
  const value=JSON.parse(text.slice(prefix.length));if(typeof value.html!=='string')throw new Error('Invalid rich text');
  const tools=await richTools();readHTML=tools.clean(value.html);root.innerHTML=readHTML;
  readText=root.innerText;
  const parts=[];let inline=null;
  // Group bare text and inline formatting too: contenteditable does not always emit paragraphs.
  for(const node of Array.from(root.childNodes)){
   if(node.nodeType===1&&['P','DIV','UL','OL','BLOCKQUOTE','PRE'].includes(node.tagName)){
    const wrap=document.createElement('div');node.replaceWith(wrap);wrap.append(node);parts.push(wrap);inline=null;
   }else{
    if(!inline){inline=document.createElement('div');node.before(inline);parts.push(inline);}inline.append(node);
   }
  }
  for(const block of parts){if(block.innerText.trim())addBlockCopy(block,block.innerText,block.innerHTML);}

 }else{
  readText=text;readHTML=null;
  const chunks=text.split(/(\n[ \t]*\n)/);
  for(const chunk of chunks){if(/^\n[ \t]*\n$/.test(chunk)){root.append(document.createTextNode(chunk));continue;}const block=document.createElement('div');block.textContent=chunk;addBlockCopy(block,chunk,null);root.append(block);}
 }
}
$('open-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!secrets||closed)return;busy($('open'),true);status('');
 try{
  const data=await api(`/api/messages/${secrets.id}/open`,{access:secrets.access,pin:$('pin').value||null});
  try{const bytes=await unsealBytes(data.ciphertext,data.iv,secrets.key);const isAudio=new TextDecoder().decode(bytes.subarray(0,17)).startsWith('whisper:audio:v1\n');const tools=isAudio?await audioTools():null,clip=tools?.unpackClip(bytes);show('reading');if(clip){$('plaintext').hidden=true;$('copy-all').hidden=true;$('received-audio').hidden=false;receivedPlayer=tools.createPlayer($('received-audio'),clip,phase=>face.expression(phase==='playing'?'playing':'happy'));}else{await renderMessage(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}$('pin').value='';secrets=null;}
  catch{ended(t('decodeError'));}
 }catch(err){if(err.status===410)ended(err.message);else status(err.status?err.message:'openNetwork');}
 finally{busy($('open'),false);}
});
$('copy-all').addEventListener('click',()=>copy(readText,readHTML));
$('copy-selection').addEventListener('pointerdown',e=>e.preventDefault());
$('copy-selection').addEventListener('click',()=>copy(selectedText));
document.addEventListener('selectionchange',()=>{
 const selection=window.getSelection(),root=$('plaintext');
 if(selection&&root.contains(selection.anchorNode)&&root.contains(selection.focusNode)&&selection.toString().trim()){
  selectedText=selection.toString();$('copy-selection').hidden=false;
 }else if(document.activeElement!==$('copy-selection')){selectedText='';$('copy-selection').hidden=true;}
});
$('clear').addEventListener('click',()=>ended(t('cleared')));
$('revoke').addEventListener('click',async()=>{if(!secrets)return;busy($('revoke'),true);try{await api(`/api/messages/${secrets.id}/revoke`,{revoke:secrets.revoke});ended(t('revoked'));}catch(err){status(err.message);}finally{busy($('revoke'),false);}});
let routeGeneration=0;
async function route(){
 const generation=++routeGeneration;
 if(location.pathname==='/'&&location.hash){
  const seed=location.hash.slice(1);forget();closed=false;
  history.replaceState(null,'','/');
  try{const short=await deriveShortLink(seed);if(generation!==routeGeneration)return;secrets={id:short.id,key:short.key,access:short.access};show('receive');await receiveMetadata(generation);}
  catch(err){if(generation===routeGeneration)ended(t('invalidLink'));}
  return;
 }
 const match=location.pathname.match(/^\/(m|revoke)\/([A-Za-z0-9_-]{43})$/);
 if(match){
  const fragment=location.hash;forget();closed=false;
  history.replaceState(null,'',location.pathname);
  try{
   if(match[1]==='m'){secrets={id:match[2],...readLink(fragment)};show('receive');await receiveMetadata(generation);}
   else{const r=new URLSearchParams(fragment.slice(1)).get('r');if(!r||!/^[A-Za-z0-9_-]{43}$/.test(r))throw new Error('Link thu hồi không hợp lệ.');secrets={id:match[2],revoke:r};show('destroy');}
  }catch(err){ended(t('invalidLink'));}
 }else if(location.pathname!=='/'){ended(t('invalidLink'));}
}
initLanguage();
const face=watcher($('create'));
let lastLine=-1,expiryTimer,challenge=null,challengeValue=0,checking=false,challengeGeneration=0,bubbleTimer,bubbleHide,bubbleTextTimer;
function serverError(message,code){if(code===410)return 'gone';if(code===401)return 'pinError';if(code===429||code===503)return 'network';if(message?.includes('Xác nhận')||message?.includes('xác nhận'))return 'challengeError';return 'network';}
function stopBubbles(){clearTimeout(bubbleTimer);clearTimeout(bubbleHide);clearTimeout(bubbleTextTimer);$('watcher-line').removeAttribute('data-on');}
function say(line,hold=5000){
 clearTimeout(bubbleHide);clearTimeout(bubbleTextTimer);const el=$('watcher-line');el.removeAttribute('data-on');
 bubbleTextTimer=setTimeout(()=>{if(document.hidden)return;el.textContent=line;el.dataset.on='';bubbleHide=setTimeout(()=>el.removeAttribute('data-on'),hold);},160);
}
function resumeBubbles(){
 stopBubbles();if(document.hidden||$('share-dock').hidden||$('settings').open)return;
 const cycle=()=>{if(document.hidden||$('settings').open)return;
 let line;
 if(currentView==='compose'&&mode==='text'){const pool=chatter();let next;do{next=Math.floor(Math.random()*pool.length);}while(next===lastLine&&pool.length>1);lastLine=next;line=pool[next];}
 else if(currentView==='compose')line=t(({idle:'speak',waiting:'preparing',recording:'recording',ready:'recorded',playing:'playing'})[voicePhase]||'speak');
 else line=t(({created:'ready',receive:metadata?.burn?'oneRead':'checking',reading:'closeMessage'})[currentView]||'message');
 say(line);bubbleTimer=setTimeout(cycle,8500+Math.random()*2000);
 };cycle();
}
function companion(id){
 clearInterval(expiryTimer);$('share-dock').hidden=['destroy','ended'].includes(id);face.anonymous(['created','receive','reading'].includes(id));face.expression(id==='created'?'happy':'idle');$('create').disabled=id!=='compose';resumeBubbles();
}
async function receiveMetadata(generation){
 $('open').disabled=true;$('pin').hidden=false;document.querySelector('label[for="pin"]').hidden=false;
 try{const data=await api(`/api/messages/${secrets.id}/metadata`,{access:secrets.access});if(generation!==routeGeneration)return;metadata=data;
 $('pin').hidden=!data.requires_pin;document.querySelector('label[for="pin"]').hidden=!data.requires_pin;
 const update=()=>{const left=data.expires_at*1000-Date.now();if(left<=0){ended(t('expired'));return;}const time=duration(left/1000);$('receive-note').textContent=t(data.burn?'readOnce':'readTimed',{time});};
 update();expiryTimer=setInterval(update,15000);$('open').disabled=false;resumeBubbles();
 }catch(e){if(generation!==routeGeneration)return;if(e.status===410)ended(t(e.message));else{$('receive-note').textContent=t('network');$('open').disabled=false;}}
}
const wake=wakeSlider($('wake-track'),$('wake-value'),v=>{challengeValue=v;$('settings-done').disabled=!challenge||v!==challenge.target||checking;});
const slide=slideConfirm($('slide-track'),()=>completeVerification(100));
function validateDraft(){if(mode==='voice'){if(!recorder?.getClip())throw new Error('recordFirst');return;}const text=draft();if(!text.trim()||new TextEncoder().encode(text).length>TEXT_LIMIT)throw new Error('textLimit');}
function challengeLabel(){if(challenge)$('challenge-label').textContent=t(challenge.mobile?'slide':'drag',{n:new Intl.NumberFormat(locale).format(challenge.target)});}
async function beginVerification(){
 if(checking)return;
 const generation=++challengeGeneration;challenge=null;wake.reset();slide.reset();stopBubbles();$('verification-note').textContent='';$('challenge-retry').hidden=true;$('settings-done').disabled=true;$('challenge-label').textContent=t('preparing');
 const mobile=matchMedia('(pointer: coarse)').matches||innerWidth<=600;
 $('challenge-label').classList.toggle('sr-only',mobile);$('desktop-challenge').hidden=mobile;$('mobile-challenge').hidden=!mobile;$('settings-done').hidden=mobile;
 try{const c=await api('/api/challenges',{mobile});if(!$('settings').open||generation!==challengeGeneration)return;challenge={...c,mobile};challengeLabel();}
 catch(e){if(generation===challengeGeneration){$('verification-note').textContent=t(e.message);$('challenge-retry').hidden=false;}}
}
async function completeVerification(answer){
 if(!challenge||checking)return;
 try{validateDraft();expirySeconds();}catch(e){status(e.message);slide.reset();return;}
 checking=true;$('settings-done').disabled=true;const verification={id:challenge.id,answer};challenge=null;face.anonymous(true);
 try{await createMessage(verification);}finally{checking=false;if(currentView==='compose'&&$('settings').open)beginVerification();}
}
$('challenge-retry').addEventListener('click',beginVerification);
function stopVoice(clear=false){recorder?.stop(true);preview?.pause();if(clear){recorder?.clear();preview?.destroy();preview=null;}}
async function setMode(next){
 if(next===mode)return;stopVoice();const before=$('create').getBoundingClientRect();mode=next;document.body.classList.toggle('audio-compose',mode==='voice');$('share-dock').classList.toggle('voice-mode',mode==='voice');
 $('text-editor').hidden=mode==='voice';$('voice-stage').hidden=mode!=='voice';$('format-option').hidden=mode==='voice';$('copy-draft').hidden=mode==='voice';$('text-mode').setAttribute('aria-pressed',String(mode==='text'));$('audio-mode').setAttribute('aria-pressed',String(mode==='voice'));
 $('create').removeAttribute('aria-haspopup');if(mode==='text'){$('create').setAttribute('aria-haspopup','dialog');$('create').setAttribute('aria-label',t('create'));}else $('create').setAttribute('aria-label',t('hold'));
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const after=$('create').getBoundingClientRect();$('create').animate([{transform:`translate(${before.x-after.x}px,${before.y-after.y}px) scale(${before.width/after.width})`},{transform:'translateY(-8px) scale(1.035)',offset:.78},{transform:'none'}],{duration:520,easing:'cubic-bezier(.22,.7,.25,1)'});}
 if(mode==='voice'){
  try{const tools=await audioTools();if(!recorder)recorder=tools.createRecorder($('create'),{onState:voiceState,onWave:(peaks,seconds)=>{tools.paintWave($('live-wave'),peaks);$('recording-time').textContent=tools.clock(seconds);},onClip:clip=>{preview?.destroy();preview=tools.createPlayer($('voice-preview'),clip,phase=>voiceState(phase==='error'?'ready':phase));},onError:key=>{voiceState(recorder?.getClip()?'ready':'idle');face.expression('sad');status(key);say(t(key));}});voiceState(recorder.getClip()?'ready':'idle');}catch{status('micUnsupported');}
 }else{face.expression('idle');resumeBubbles();}count();
}
function voiceState(phase){
 voicePhase=phase;if(currentView!=='compose'||mode!=='voice')return;
 face.expression(({idle:'curious',waiting:'curious',recording:'listening',ready:'happy',playing:'playing'})[phase]||'idle');
 $('recording-wave').hidden=phase!=='recording';$('voice-preview').hidden=!recorder?.getClip()||phase==='recording'||phase==='waiting';$('delete-recording').hidden=!recorder?.getClip()||phase==='recording';$('share-recording').hidden=!recorder?.getClip()||phase==='recording'||phase==='waiting';$('voice-instruction').textContent=t(phase==='recording'?'recording':phase==='waiting'?'preparing':phase==='ready'?'hold':phase==='playing'?'playing':'hold');
 resumeBubbles();
}
$('text-mode').addEventListener('click',()=>setMode('text'));
$('audio-mode').addEventListener('click',()=>setMode('voice'));
$('share-recording').addEventListener('click',openSettings);
$('delete-recording').addEventListener('click',()=>{recorder?.clear();preview?.destroy();preview=null;$('voice-preview').hidden=true;voiceState('idle');});
// Recorder listeners are installed on the shared bot; disable them when not in voice compose.
$('create').addEventListener('pointerdown',e=>{if(mode!=='voice'||currentView!=='compose')e.stopImmediatePropagation();},true);
$('create').addEventListener('keydown',e=>{if(mode!=='voice'||currentView!=='compose')e.stopImmediatePropagation();},true);
window.addEventListener('whisper-languagechange',()=>{count();challengeLabel();resumeBubbles();$('create').setAttribute('aria-label',t(mode==='voice'?'hold':'create'));if(currentView==='compose'&&mode==='voice')voiceState(voicePhase);if(metadata&&currentView==='receive')$('receive-note').textContent=t(metadata.burn?'readOnce':'readTimed',{time:duration((metadata.expires_at*1000-Date.now())/1000)});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBubbles();else resumeBubbles();});
companion('compose');
route();
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',()=>{routeGeneration++;stopBubbles();forget();});
window.addEventListener('pageshow',e=>{if(e.persisted)ended(t('cleared'));});
