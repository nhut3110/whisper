import {t,locale,duration,initLanguage,chatter} from '/i18n.js';
import {watcher,wakeSlider,slideConfirm} from '/interactions.js';
import {editorMenu} from '/editor-menu.js';
import {formatted} from '/format.js';
import {seal,sealBytes,unsealBytes,TEXT_LIMIT,randomToken,randomPin,readLink,newShortLink,deriveShortLink} from '/crypto.js';
const $=id=>document.getElementById(id),prefix='hush:rich:v1\n';
// shadcn controls expose checked state through ARIA; custom setters are explicit.
function option(id){return $(id).getAttribute('aria-checked')==='true';}
function setOption(id,value){$(id).setAttribute('aria-checked',String(value));$(id).dispatchEvent(new CustomEvent('whisper:set-option',{detail:value}));}
const musicPrefix='whisper:music:v1\n';
let musicRef=null,readingMusic=false,musicScreen='library';
let botMotion=null,chatActive=false;
function chatSelection(active){
 chatActive=active;document.body.classList.toggle('integrated-chat',active);
 $('room-mode').setAttribute('aria-pressed',String(active));
 for(const [id,value] of [['text-mode','text'],['audio-mode','voice'],['music-mode','music']])$(id).setAttribute('aria-pressed',String(!active&&mode===value));
 document.dispatchEvent(new CustomEvent('whisper:chat-mode',{detail:active}));
}

function moveBot(change){
 const bot=$('create'),before=bot.getBoundingClientRect();botMotion?.cancel();change();
 const after=bot.getBoundingClientRect();
 if(!before.width||!after.width||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 botMotion=bot.animate([{transform:`translate(${before.x-after.x}px,${before.y-after.y}px) scale(${before.width/after.width})`,transformOrigin:'0 0'},{transform:'none',transformOrigin:'0 0'}],{duration:620,easing:'cubic-bezier(.22,1,.36,1)'});
 return botMotion;
}
function musicPose(data){
 if(!((currentView==='compose'&&mode==='music')||(currentView==='reading'&&readingMusic)))return;
 const dock=$('share-dock'),selected=data.screen!=='library';musicScreen=data.screen;
 moveBot(()=>{dock.classList.toggle('music-performer',selected);if(selected){const frame=$('music-frame').getBoundingClientRect();dock.style.setProperty('--music-x',`${frame.left+data.x}px`);dock.style.setProperty('--music-y',`${frame.top+data.y}px`);dock.style.setProperty('--music-size',`${data.size}px`);}});
 face.gear(selected?'singing':'none');face.expression(data.playing?'playing':'happy');dock.classList.toggle('music-playing',!!data.playing);
 if(data.intro)say(data.intro,1900);else if(selected)stopBubbles();else resumeBubbles();
}
let secrets=null,closed=false,rich=null,readText='',readHTML=null,selectedText='';
let audio=null,recorder=null,preview=null,receivedPlayer=null,mode='text',voicePhase='idle',currentView='compose',metadata=null,readingAudio=false,endedReason='gone';
async function audioTools(){if(!audio)audio=await import('/audio.js');return audio;}
const sections=['compose','created','receive','reading','destroy','ended'];
let viewAnimation=null,viewGeneration=0,edit=null;
function musicSend(data){$('music-frame').contentWindow?.postMessage({whisperMusic:1,...data},location.origin);}
function syncMusic(){const active=(currentView==='compose'&&mode==='music')||(currentView==='reading'&&readingMusic);$('music-stage').hidden=!active;$('share-music').hidden=!active||currentView!=='compose'||!musicRef;$('close-music').hidden=!active||currentView!=='reading';if(active){if(!$('music-frame').getAttribute('src'))$('music-frame').src='/music-beta/?embed=1';$('share-dock').hidden=false;document.body.classList.add('music-active');musicSend({action:'pose'});}else{document.body.classList.remove('music-active');$('share-dock').classList.remove('music-performer','music-playing');$('share-dock').hidden=false;musicSend({action:'pause'});}}
function show(id){
 edit?.dismiss();
 const generation=++viewGeneration;currentView=id;
 viewAnimation=moveBot(()=>{
  if(id!=='compose'){stopVoice();document.body.classList.remove('audio-compose');$('share-dock').classList.remove('voice-mode');}
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  sections.forEach(s=>$(s).hidden=s!==id);
  $('compose-actions').hidden=id!=='compose';$('copy-draft').hidden=id!=='compose';$('copy-draft').disabled=mode!=='text';$('copy-all').hidden=id!=='reading'||readingAudio||readingMusic;
  document.body.classList.toggle('audio-reading',id==='reading'&&readingAudio);
  companion(id);syncMusic();status('');
 });
 if(viewAnimation){stopBubbles();viewAnimation.finished.then(()=>{if(generation===viewGeneration)resumeBubbles();}).catch(()=>{});}
}

let statusTimer;
function status(text){clearTimeout(statusTimer);$('status').textContent=text?t(text):'';if(text)statusTimer=setTimeout(()=>$('status').textContent='',4500);}
async function richTools(){if(!rich)rich=await import('/rich.js');return rich;}
async function api(path,data){
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',credentials:'same-origin',redirect:'error'});
  if(!res.ok){let message='network';try{const data=await res.json();message=serverError(data.error,res.status,data.code);}catch{}const e=new Error(message);e.status=res.status;throw e;}
  return res.status===204?null:res.json();
}
function busy(button,value){button.disabled=value;button.setAttribute('aria-busy',String(value));}
function forget(){readingMusic=false;musicRef=null;musicSend({action:'clear'});stopVoice(true);receivedPlayer?.destroy();receivedPlayer=null;clearInterval(expiryTimer);metadata=null;secrets=null;readText='';readHTML=null;selectedText='';$('plaintext').replaceChildren();$('rich-editor').replaceChildren();$('message').value='';$('share-link').value='';$('revoke-link').value='';$('generated-pin').textContent='';$('pin').value='';drawPin();$('copy-selection').hidden=true;$('copy-all').hidden=false;$('received-audio').hidden=true;$('plaintext').hidden=false;closed=true;}
function ended(note){endedReason=note;forget();show('ended');$('ended-note').textContent=t(note);}
function draft(){
 if(!option('rich-mode'))return $('message').value;
 if(!$('rich-editor').innerText.trim())throw new Error('textLimit');
 return prefix+JSON.stringify({html:rich.clean($('rich-editor').innerHTML)});
}
function count(){if(!$('settings').open){status('');return;}let text='';try{text=draft();}catch{}const bytes=new TextEncoder().encode(text).length;const voice=mode==='voice';$('count').textContent=voice?t('audioLimit'):`${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(bytes/1024)} / 256 KiB`;$('size-meter').hidden=voice;$('size-meter').value=bytes;status('');}
async function copy(text,html=null){
 try{
  if(html&&typeof ClipboardItem!=='undefined'&&navigator.clipboard.write){
   await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);
  }else await navigator.clipboard.writeText(text);
  status('copied');return true;
 }catch{status('copyFailed');return false;}
}
function openSettings(){musicSend({action:'pause'});$('settings-error').hidden=true;stopVoice();preview?.pause();$('settings').showModal();count();beginVerification();}
$('create').addEventListener('click',()=>{
 if(currentView==='receive'){stopBubbles();$('recipient-open').showModal();}
 else if(currentView==='reading'){receivedPlayer?.pause();musicSend({action:'pause'});stopBubbles();$('recipient-close').showModal();}
 else if(currentView==='ended'){history.replaceState(null,'','/');readingAudio=false;show('compose');if(mode==='voice')setMode('text');else $('message').focus();}
 else if(mode==='text'&&currentView==='compose')openSettings();
 else if(mode==='music'&&currentView==='compose'){if(musicScreen==='library')$('music-frame').contentDocument?.getElementById('query')?.focus();else musicSend({action:'toggle'});}
});
for(const dialog of [$('recipient-open'),$('recipient-close')]){
 dialog.addEventListener('close',()=>{resumeBubbles();if(['receive','reading'].includes(currentView))$('create').focus({preventScroll:true});});
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
}
for(const button of document.querySelectorAll('[data-dismiss]'))button.addEventListener('click',()=>$(button.dataset.dismiss).close());
$('settings-done').addEventListener('click',()=>{if(challengeValue===challenge?.target)completeVerification(challengeValue);});
$('settings-close').addEventListener('click',()=>$('settings').close());
$('settings').addEventListener('click',e=>{if(e.target!==$('settings'))return;const r=$('settings').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('settings').close();});
$('settings').addEventListener('close',()=>{challengeGeneration++;challenge=null;wake.reset();slide.reset();face.anonymous(currentView==='created');resumeBubbles();});
$('ttl').addEventListener('change',()=>{const custom=$('ttl').value==='custom';$('custom-expiry').hidden=!custom;$('ttl-minutes').required=custom;});
$('message').addEventListener('input',count);
$('rich-editor').addEventListener('input',count);
$('rich-mode').addEventListener('whisper:option-change',async()=>{
 const on=option('rich-mode');busy($('rich-mode'),true);
 try{
  if(on){const tools=await richTools();$('rich-editor').innerHTML=tools.fromText($('message').value);}
  else $('message').value=$('rich-editor').innerText;
  $('message').hidden=on;$('message').required=!on;$('rich-editor').hidden=!on;$('rich-toolbar').hidden=!on;
  $('message-label').htmlFor=on?'rich-editor':'message';
  (on?$('rich-editor'):$('message')).focus();count();
 }catch{ setOption('rich-mode',false);status('richFailed'); }
 finally{busy($('rich-mode'),false);}
});
async function enableWriting(start,end){
 if(currentView!=='compose'||mode!=='text')return false;
 if(option('rich-mode'))return true;
 const source=$('message');let text=source.value;start??=source.selectionStart;end??=source.selectionEnd;
 try{
  const tools=await richTools();
  if(currentView!=='compose'||mode!=='text'||source.hidden)return false;
  if(source.value.slice(start,end)!==text.slice(start,end))return false;
  text=source.value;
  rich=tools;setOption('rich-mode',true);$('rich-editor').innerHTML=tools.fromText(text);source.hidden=true;$('rich-editor').hidden=false;$('message-label').htmlFor='rich-editor';$('rich-editor').focus();
  const nodes=[],walker=document.createTreeWalker($('rich-editor'),NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node,total=0;
  while(node=walker.nextNode()){if(node.nodeType===Node.TEXT_NODE||node.nodeName==='BR'){const length=node.nodeName==='BR'?1:node.textContent.length;nodes.push({node,start:total,length});total+=length;}}
  const point=offset=>{for(const entry of nodes){if(offset<=entry.start+entry.length){if(entry.node.nodeName==='BR')return [entry.node.parentNode,[...entry.node.parentNode.childNodes].indexOf(entry.node)+(offset>entry.start?1:0)];return [entry.node,Math.max(0,offset-entry.start)];}}return [$('rich-editor'),$('rich-editor').childNodes.length];};
  const range=document.createRange();range.setStart(...point(start));range.setEnd(...point(end));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);count();return true;
 }catch{status('richFailed');return false;}
}
document.addEventListener('whisper:editor-clean',async event=>event.detail(await richTools()));
document.addEventListener('whisper:editor-notice',event=>status(event.detail));
document.addEventListener('whisper:editor-prepare',()=>{void richTools().catch(()=>{});});
document.addEventListener('whisper:editor-translate',event=>event.detail({t}));
document.addEventListener('whisper:editor-enable',async event=>{event.detail.resolve(await enableWriting(event.detail.start,event.detail.end));});
for(const button of document.querySelectorAll('[data-command]')){
 button.addEventListener('pointerdown',e=>e.preventDefault());
 button.addEventListener('click',async()=>{if(!await enableWriting())return;$('rich-editor').focus();document.execCommand(button.dataset.command,false);count();});
}
$('rich-editor').addEventListener('paste',async e=>{
 e.preventDefault();const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain'),notion=e.clipboardData.getData('text/_notion-blocks-v3-production');
 // The optional module is already loaded before this editor is shown. Never insert raw clipboard HTML.
 document.execCommand('insertHTML',false,rich.clipboard(html,text,notion));count();
});
$('rich-editor').addEventListener('drop',e=>e.preventDefault());
// Preserve safe clipboard formatting automatically without making every draft rich.
let pasteGeneration=0;
$('message').addEventListener('paste',async e=>{
 const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain'),notion=e.clipboardData.getData('text/_notion-blocks-v3-production');
 if(!html&&!notion&&!formatted(text))return;
 e.preventDefault();const generation=++pasteGeneration,source=$('message'),before=source.value,start=source.selectionStart,end=source.selectionEnd;
 // Insert the plain fallback immediately; an optional parser failure never loses the paste.
 source.setRangeText(text,start,end,'end');const inserted=source.value;count();
 try{
  const tools=await richTools();
  if(generation!==pasteGeneration||source.value!==inserted||currentView!=='compose'||mode!=='text'||option('rich-mode'))return;
  const safe=tools.clipboard(html,text,notion);
  $('rich-editor').innerHTML=tools.fromText(before.slice(0,start))+safe+tools.fromText(before.slice(end));
  setOption('rich-mode',true);source.hidden=true;$('rich-editor').hidden=false;$('rich-toolbar').hidden=false;$('message-label').htmlFor='rich-editor';
  $('rich-editor').focus();const selection=getSelection(),range=document.createRange();range.selectNodeContents($('rich-editor'));range.collapse(false);selection.removeAllRanges();selection.addRange(range);count();
 }catch{status('richFailed');}
});
$('copy-draft').addEventListener('click',()=>{if(option('rich-mode'))copy($('rich-editor').innerText,rich.clean($('rich-editor').innerHTML));else copy($('message').value);});
function expirySeconds(){
 const ttl=$('ttl').value==='custom'?Number($('ttl-minutes').value)*60:Number($('ttl').value);
 if(!Number.isInteger(ttl)||ttl<60||ttl>604800){throw new Error('expiryError');}return ttl;
}
$('compose-form').addEventListener('submit',async e=>{
 e.preventDefault();openSettings();
});
async function createMessage(verification){
 busy($('create'),true);status('');$('settings-error').hidden=true;
 try{
  const ttl=expirySeconds();
  validateDraft();
  const short=await newShortLink(),encrypted=mode==='voice'?await sealBytes(await audio.packClip(recorder.getClip()),short.key):await seal(mode==='music'?musicPrefix+JSON.stringify(musicRef):draft(),short.key),access=short.access,revoke=randomToken(),pin=option('use-pin')?randomPin():null;
  const result=await api('/api/messages',{id:short.id,ciphertext:encrypted.ciphertext,iv:encrypted.iv,access,revoke,ttl,burn:option('burn'),pin,verification});
  $('share-link').value=`${location.origin}/s/${short.id.slice(0,16)}#${short.seed}`;
  $('revoke-link').value=`${location.origin}/revoke/${result.id}#r=${revoke}`;
  $('pin-result').hidden=!pin;$('generated-pin').textContent=pin||'';
  $('expiry').textContent=(option('burn')?t('oneRead')+' · ':'')+t('expiresAt',{date:new Date(result.expires_at*1000).toLocaleString(locale)});
  $('message').value='';$('rich-editor').replaceChildren();stopVoice(true);show('created');
  // Never hide the only copy of the link when browser clipboard policy refuses.
  await copy($('share-link').value);
 }catch(err){status(err.message);if($('settings').open){$('settings-error').textContent=t(err.message);$('settings-error').hidden=false;}}finally{busy($('create'),false);$('create').disabled=$('compose').hidden;}
}
for(const [button,field] of [['copy-link','share-link'],['copy-pin','generated-pin'],['copy-revoke','revoke-link']])$(button).addEventListener('click',()=>copy($(field).value||$(field).textContent));
function addBlockCopy(block,text,html){
 const button=document.createElement('button');button.type='button';button.className='block-copy';button.setAttribute('aria-label',t('copyPart'));button.title=t('copyPart');
 // Static local icon only. No user-controlled HTML enters this path.
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 5V3H3v13h2"/></svg>';
 button.addEventListener('click',()=>copy(text,html));block.classList.add('message-block');block.append(button);
}
async function renderMessage(text){
 const root=$('plaintext');root.replaceChildren();const isRich=text.startsWith(prefix),auto=!isRich&&formatted(text);root.classList.toggle('plain',!isRich&&!auto);
 if(isRich||auto){
  const tools=await richTools();
  if(isRich){const value=JSON.parse(text.slice(prefix.length));if(typeof value.html!=='string')throw new Error('Invalid rich text');readHTML=tools.clean(value.html);}
  else readHTML=tools.automatic(text);
  root.innerHTML=readHTML;
  readText=root.innerText;
  const parts=[];let inline=null;
  // Group bare text and inline formatting too: contenteditable does not always emit paragraphs.
  for(const node of Array.from(root.childNodes)){
   if(node.nodeType===1&&['P','DIV','UL','OL','BLOCKQUOTE','PRE','H1','H2','H3','H4','H5','H6','TABLE','HR'].includes(node.tagName)){
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
 e.preventDefault();if(!secrets||closed)return;$('open-error').textContent='';$('pin-code').removeAttribute('data-phase');$('pin').removeAttribute('aria-invalid');busy($('open'),true);status('');
 try{
  const data=await api(`/api/messages/${secrets.id}/open`,{access:secrets.access,pin:$('pin').value||null});
  try{const bytes=await unsealBytes(data.ciphertext,data.iv,secrets.key);const isAudio=new TextDecoder().decode(bytes.subarray(0,17)).startsWith('whisper:audio:v1\n');const decoded=new TextDecoder('utf-8',{fatal:true}).decode(isAudio?new Uint8Array():bytes);readingMusic=decoded.startsWith(musicPrefix);if(readingMusic){const ref=JSON.parse(decoded.slice(musicPrefix.length));if(ref.provider!=='deezer'||!Number.isSafeInteger(ref.id)||ref.id<=0)throw Error('Invalid music');musicRef={provider:'deezer',id:ref.id};}const tools=isAudio?await audioTools():null,clip=tools?.unpackClip(bytes);readingAudio=!!clip;show('reading');if(clip){$('plaintext').hidden=true;$('copy-all').hidden=true;$('received-audio').hidden=false;receivedPlayer=tools.createPlayer($('received-audio'),clip,phase=>{face.expression(phase==='playing'?'playing':'happy');face.gear('performing');say(t(phase==='playing'?'playing':'listenHint'));});}else if(readingMusic){$('plaintext').hidden=true;musicSend({action:'receive',ref:musicRef});}else{$('plaintext').hidden=false;await renderMessage(decoded);}$('pin').value='';secrets=null;}
  catch{ended('decodeError');}
 }catch(err){if(err.status===410)ended(err.message);else{if(err.status===401){$('pin-code').dataset.phase='no';$('pin').setAttribute('aria-invalid','true');}$('open-error').textContent=t(err.status?err.message:'openNetwork');}}
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
$('clear').addEventListener('click',()=>ended('cleared'));
$('revoke').addEventListener('click',async()=>{if(!secrets)return;busy($('revoke'),true);try{await api(`/api/messages/${secrets.id}/revoke`,{revoke:secrets.revoke});ended('revoked');}catch(err){status(err.message);}finally{busy($('revoke'),false);}});
let routeGeneration=0;
async function route(){
 if(location.pathname==='/'&&(location.hash.startsWith('#r=')||new URLSearchParams(location.search).get('mode')==='chat')){void setMode('chat');return;}
 edit.dismiss();
 const generation=++routeGeneration;
 if((location.pathname==='/'||/^\/s\/[A-Za-z0-9_-]{16}$/.test(location.pathname))&&location.hash){
  const seed=location.hash.slice(1);forget();closed=false;
  const previewPath=location.pathname;history.replaceState(null,'',previewPath);
  try{const short=await deriveShortLink(seed);if(previewPath!=='/'&&previewPath!=='/s/'+short.id.slice(0,16))throw new Error('invalidLink');if(generation!==routeGeneration)return;secrets={id:short.id,key:short.key,access:short.access};show('receive');await receiveMetadata(generation);}
  catch(err){if(generation===routeGeneration)ended('invalidLink');}
  return;
 }
 const match=location.pathname.match(/^\/(m|revoke)\/([A-Za-z0-9_-]{43})$/);
 if(match){
  const fragment=location.hash;forget();closed=false;
  history.replaceState(null,'',location.pathname);
  try{
   if(match[1]==='m'){secrets={id:match[2],...readLink(fragment)};show('receive');await receiveMetadata(generation);}
   else{const r=new URLSearchParams(fragment.slice(1)).get('r');if(!r||!/^[A-Za-z0-9_-]{43}$/.test(r))throw new Error('Link thu hồi không hợp lệ.');secrets={id:match[2],revoke:r};show('destroy');}
  }catch(err){ended('invalidLink');}
 }else if(location.pathname!=='/'){ended('invalidLink');}
}
initLanguage();
const face=watcher($('create'));
let modeGeneration=0,switchingMode=false,modeAnimations=[];
let lastLine=-1,expiryTimer,challenge=null,challengeValue=0,checking=false,challengeGeneration=0,bubbleTimer,bubbleHide,bubbleTextTimer;
function serverError(message,code,reason){if(['activeLimit','createLimit','rateLimit'].includes(reason))return reason;if(code===429)return 'rateLimit';if(code===410)return 'gone';if(code===401)return 'pinError';if(code===429||code===503)return 'network';if(message?.includes('Xác nhận')||message?.includes('xác nhận'))return 'challengeError';return 'network';}
// One scalable, hand-drawn silhouette for both spoken thoughts and the live waveform.
function thoughtSurface(){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 320 120');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.classList.add('thought-shape');
 const path=document.createElementNS(svg.namespaceURI,'path');
 path.setAttribute('d','M49 103C28 112 8 99 9 80C0 65 10 45 29 43C24 22 48 10 69 19C81 1 112 1 130 15C150 2 180 4 191 17C215 3 243 11 249 28C273 20 297 31 296 50C317 56 319 78 306 91C306 111 280 119 260 109C240 122 214 119 200 108C181 121 151 122 132 110C110 122 82 119 74 106C64 112 54 111 49 103Z');
 svg.append(path);return svg;
}
function thoughtDots(el){for(const size of ['near','far']){const dot=document.createElement('span');dot.className='thought-dot thought-dot-'+size;dot.setAttribute('aria-hidden','true');el.append(dot);}}
const recordingCloud=document.createElement('div');recordingCloud.className='thought-cloud';
recordingCloud.append(thoughtSurface(),$('live-wave'),$('recording-time'));$('recording-wave').append(recordingCloud);thoughtDots($('recording-wave'));
function hideBubble(){const el=$('watcher-line');if(el.hasAttribute('data-on'))el.dataset.phase='leaving';el.removeAttribute('data-on');}
function stopBubbles(){clearTimeout(bubbleTimer);clearTimeout(bubbleHide);clearTimeout(bubbleTextTimer);hideBubble();}
function say(line,hold=5000){
 clearTimeout(bubbleHide);clearTimeout(bubbleTextTimer);const el=$('watcher-line'),replacing=el.hasAttribute('data-on')||el.dataset.phase==='leaving';hideBubble();
 bubbleTextTimer=setTimeout(()=>{if(document.hidden)return;const text=document.createElement('span');text.className='thought-copy';text.textContent=line;const cloud=document.createElement('span');cloud.className='thought-cloud';cloud.append(thoughtSurface(),text);el.replaceChildren(cloud);thoughtDots(el);el.dataset.direction=Math.random()<.5?'left':'right';$('recording-wave').dataset.direction=el.dataset.direction;delete el.dataset.phase;el.dataset.on='';bubbleHide=setTimeout(hideBubble,hold);},replacing?460:120);
}
function resumeBubbles(){
 if(chatActive||document.body.classList.contains('music-active')&&musicScreen!=='library')return;
 stopBubbles();if(document.hidden||switchingMode||$('share-dock').hidden||document.querySelector('dialog[open]'))return;
 const cycle=()=>{if(document.hidden||document.querySelector('dialog[open]'))return;
 let line;
 if(currentView==='compose'&&mode==='text'){const pool=chatter();let next;do{next=Math.floor(Math.random()*pool.length);}while(next===lastLine&&pool.length>1);lastLine=next;line=pool[next];}
 else if(currentView==='compose'&&mode==='music')line=locale==='vi'?'Chọn một bài, mình hát cho nghe nhé.':'Pick a song. I’ll sing it for you.';
 else if(currentView==='compose')line=t(({idle:'speak',waiting:'preparing',recording:'recording',ready:'recorded',playing:'playing'})[voicePhase]||'speak');
 else if(currentView==='receive')line=t('intro')+' '+t('tapOpen')+(metadata?' '+t(metadata.burn?'oneRead':'expiresAt',{date:new Date(metadata.expires_at*1000).toLocaleString(locale)}):'');
 else if(currentView==='ended')line=t(endedReason)+' '+t('restartHint');
 else line=t(currentView==='reading'?(readingAudio?'listenHint':'tapClose'):'ready');
 say(line,['receive','ended'].includes(currentView)?7000:5000);bubbleTimer=setTimeout(cycle,8500+Math.random()*2000);
 };cycle();
}
function companion(id){
 clearInterval(expiryTimer);const center=['receive','ended'].includes(id)||(id==='reading'&&readingAudio);
 $('watcher-line').setAttribute('aria-live',center?'polite':'off');$('share-dock').hidden=false;$('share-dock').classList.toggle('mascot-center',center);
 face.anonymous(id==='created');face.gear(id==='reading'&&readingAudio?'performing':'none');face.expression(id==='ended'?'sad':id==='created'?'happy':'curious');
 $('create').disabled=['created','destroy'].includes(id);
 const action=id==='receive'?'open':id==='reading'?'closeMessage':id==='ended'?'newMessage':mode==='voice'?'hold':'create';
 $('create').setAttribute('aria-label',t(action));$('create').setAttribute('aria-controls',id==='receive'?'recipient-open':id==='reading'?'recipient-close':'settings');
 if(id==='ended')$('create').removeAttribute('aria-haspopup');else $('create').setAttribute('aria-haspopup','dialog');
 resumeBubbles();
}
async function receiveMetadata(generation){
 $('open').disabled=true;$('pin').hidden=false;document.querySelector('label[for="pin"]').hidden=false;
 try{const data=await api(`/api/messages/${secrets.id}/metadata`,{access:secrets.access});if(generation!==routeGeneration)return;metadata=data;
 $('pin').hidden=!data.requires_pin;document.querySelector('label[for="pin"]').hidden=!data.requires_pin;
 const update=()=>{const left=data.expires_at*1000-Date.now();if(left<=0){ended('expired');return;}const time=duration(left/1000);$('receive-note').textContent=t(data.burn?'readOnce':'readTimed',{time});};
 update();expiryTimer=setInterval(update,15000);$('open').disabled=false;resumeBubbles();
 }catch(e){if(generation!==routeGeneration)return;if(e.status===410)ended(e.message);else{$('receive-note').textContent=t('network');$('open').disabled=false;}}
}
const wake=wakeSlider($('wake-track'),$('wake-value'),v=>{challengeValue=v;$('settings-done').disabled=!challenge||v!==challenge.target||checking;});
const slide=slideConfirm($('slide-track'),()=>completeVerification(100));
function validateDraft(){if(mode==='music'){if(!musicRef)throw new Error('musicFirst');return;}if(mode==='voice'){if(!recorder?.getClip())throw new Error('recordFirst');return;}const text=draft();if(!text.trim()||new TextEncoder().encode(text).length>TEXT_LIMIT)throw new Error('textLimit');}
function challengeLabel(){if(challenge)$('challenge-label').textContent=t(challenge.mobile?'slide':'drag',{n:new Intl.NumberFormat(locale).format(challenge.target)});}
async function beginVerification(){
 if(checking)return;
 const generation=++challengeGeneration;challenge=null;wake.reset();slide.reset();stopBubbles();$('verification-note').textContent='';$('challenge-retry').hidden=true;$('settings-done').disabled=true;$('challenge-label').textContent=t('preparing');
 const mobile=matchMedia('(pointer: coarse)').matches||innerWidth<=600;
 $('verification').setAttribute('aria-busy','true');$('verify-loading').hidden=false;$('verify-body').hidden=true;$('verify-failure').hidden=true;$('challenge-label').classList.toggle('sr-only',mobile);$('desktop-challenge').hidden=mobile;$('mobile-challenge').hidden=!mobile;$('settings-done').hidden=true;
 try{const c=await api('/api/challenges',{mobile});if(!$('settings').open||generation!==challengeGeneration)return;challenge={...c,mobile};challengeLabel();$('verification').setAttribute('aria-busy','false');$('verify-loading').hidden=true;$('verify-body').hidden=false;$('settings-done').hidden=mobile;}
 catch(e){if(generation===challengeGeneration&&$('settings').open){$('verification').setAttribute('aria-busy','false');$('verify-loading').hidden=true;$('verify-failure').hidden=false;$('verification-note').textContent=t(e.message);$('challenge-retry').hidden=false;}}
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
 if(next==='chat'){
  if(chatActive)return;
  ++modeGeneration;for(const animation of modeAnimations)animation.cancel();modeAnimations=[];switchingMode=false;
  stopVoice();musicSend({action:'pause'});stopBubbles();edit?.dismiss();
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  chatSelection(true);history.replaceState(null,'','/?mode=chat'+location.hash);return;
 }
 if(chatActive){chatSelection(false);history.replaceState(null,'','/');syncMusic();resumeBubbles();}
 if(next===mode)return;
 const previous=mode,generation=++modeGeneration;mode=next;musicSend({action:'pause'});switchingMode=true;stopVoice();stopBubbles();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const outgoing=previous==='music'?$('music-stage'):previous==='voice'?$('voice-stage'):$('text-editor');
 // Content fades independently; moveBot preserves the current visual pose
 // when an in-flight movement is interrupted or reversed.
 for(const animation of modeAnimations)animation.cancel();modeAnimations=[];
 if(!reduced){
  const exit=outgoing.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -6px'}],{duration:110,easing:'ease-out'});modeAnimations.push(exit);
  await exit.finished.catch(()=>{});if(generation!==modeGeneration)return;
 }
 for(const animation of modeAnimations)animation.cancel();modeAnimations=[];
 const movement=moveBot(()=>{
 document.body.classList.toggle('audio-compose',mode==='voice');$('share-dock').classList.toggle('voice-mode',mode==='voice');
 $('text-editor').hidden=mode!=='text';$('voice-stage').hidden=mode!=='voice';$('format-option').hidden=mode!=='text';$('copy-draft').disabled=mode!=='text';$('text-mode').setAttribute('aria-pressed',String(mode==='text'));$('audio-mode').setAttribute('aria-pressed',String(mode==='voice'));$('music-mode').setAttribute('aria-pressed',String(mode==='music'));syncMusic();
 });
 $('create').removeAttribute('aria-haspopup');if(mode==='text'){$('create').setAttribute('aria-haspopup','dialog');$('create').setAttribute('aria-label',t('create'));}else $('create').setAttribute('aria-label',t(mode==='music'?'music':'hold'));
 const incoming=mode==='music'?$('music-stage'):mode==='voice'?$('voice-stage'):$('text-editor');
 if(!reduced){
  modeAnimations.push(incoming.animate([{opacity:0,translate:'0 10px'},{opacity:1,translate:'0 0'}],{duration:380,easing:'cubic-bezier(.2,.7,.2,1)'}));
 }
 if(mode==='voice'){
  try{const tools=await audioTools();if(generation!==modeGeneration)return;if(!recorder)recorder=tools.createRecorder($('create'),{onState:voiceState,onWave:(peaks,seconds)=>{tools.paintWave($('live-wave'),peaks);$('recording-time').textContent=tools.clock(seconds);},onClip:clip=>{preview?.destroy();preview=tools.createPlayer($('voice-preview'),clip,phase=>voiceState(phase==='error'?'ready':phase));},onError:key=>{voiceState(recorder?.getClip()?'ready':'idle');face.expression('sad');status(key);say(t(key));}});voiceState(recorder.getClip()?'ready':'idle');}catch{status('micUnsupported');}
 }else{face.gear(mode==='music'&&musicScreen!=='library'?'singing':'none');face.expression('idle');}count();
 await movement?.finished.catch(()=>{});
 if(generation===modeGeneration){switchingMode=false;modeAnimations=[];resumeBubbles();}
}
function voiceState(phase){
 voicePhase=phase;if(currentView!=='compose'||mode!=='voice')return;
 face.gear(phase==='playing'?'performing':'recording');
 face.expression(({idle:'curious',waiting:'curious',recording:'listening',ready:'happy',playing:'playing'})[phase]||'idle');
 $('recording-wave').hidden=phase!=='recording';$('voice-preview').hidden=!recorder?.getClip()||phase==='recording'||phase==='waiting';$('delete-recording').hidden=!recorder?.getClip()||phase==='recording';$('share-recording').hidden=!recorder?.getClip()||phase==='recording'||phase==='waiting';$('voice-instruction').textContent=t(phase==='recording'?'recording':phase==='waiting'?'preparing':phase==='ready'?'hold':phase==='playing'?'playing':'hold');
 resumeBubbles();
}
$('music-mode').hidden=!document.querySelector('meta[name=whisper-music-beta]');
$('music-mode').addEventListener('click',()=>setMode('music'));
$('share-music').addEventListener('click',openSettings);
$('close-music').addEventListener('click',()=>{musicSend({action:'pause'});$('recipient-close').showModal();});
function musicAppearance(){musicSend({action:'appearance',theme:document.documentElement.dataset.theme,locale});}
$('music-frame').addEventListener('load',()=>{musicAppearance();if(readingMusic)musicSend({action:'receive',ref:musicRef});});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('music-frame').contentWindow||e.data?.whisperMusic!==1)return;if(e.data.action==='pose'){musicPose(e.data);return;}if(e.data.action==='performance'){if(document.body.classList.contains('music-active')){face.expression(e.data.playing?'playing':'happy');$('share-dock').classList.toggle('music-playing',!!e.data.playing);}return;}if(e.data.action==='ready'){musicAppearance();musicSend({action:'pose'});if(readingMusic)musicSend({action:'receive',ref:musicRef});}if(e.data.action==='select'&&currentView==='compose'&&mode==='music'){const ref=e.data.ref;musicRef=ref?.provider==='deezer'&&Number.isSafeInteger(ref.id)&&ref.id>0?{provider:'deezer',id:ref.id}:null;syncMusic();}});
new MutationObserver(musicAppearance).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
window.addEventListener('whisper-languagechange',musicAppearance);
document.addEventListener('whisper:chat-error',()=>{if(chatActive){chatSelection(false);history.replaceState(null,'','/');syncMusic();resumeBubbles();status('network');}});
$('room-mode').addEventListener('click',()=>setMode('chat'));
$('text-mode').addEventListener('click',()=>setMode('text'));
$('audio-mode').addEventListener('click',()=>setMode('voice'));
$('share-recording').addEventListener('click',openSettings);
$('delete-recording').addEventListener('click',()=>{recorder?.clear();preview?.destroy();preview=null;$('voice-preview').hidden=true;voiceState('idle');});
// Recorder listeners are installed on the shared bot; disable them when not in voice compose.
$('create').addEventListener('pointerdown',e=>{if(mode!=='voice'||currentView!=='compose')e.stopImmediatePropagation();},true);
$('create').addEventListener('keydown',e=>{if(mode!=='voice'||currentView!=='compose')e.stopImmediatePropagation();},true);
window.addEventListener('whisper-languagechange',()=>{count();challengeLabel();resumeBubbles();if(currentView==='ended')$('ended-note').textContent=t(endedReason);$('create').setAttribute('aria-label',t(currentView==='receive'?'open':currentView==='reading'?'closeMessage':currentView==='ended'?'newMessage':mode==='voice'?'hold':'create'));if(currentView==='compose'&&mode==='voice')voiceState(voicePhase);if(metadata&&currentView==='receive')$('receive-note').textContent=t(metadata.burn?'readOnce':'readTimed',{time:duration((metadata.expires_at*1000-Date.now())/1000)});});
document.addEventListener('visibilitychange',()=>{if(document.hidden){musicSend({action:'pause'});stopBubbles();}else resumeBubbles();});
// Six visual cells, one real field: native editing, paste and code autofill remain intact.
// Adapted from Bencho Otp (MIT), references/bencho/Otp.tsx and Otp.css.
function drawPin(event){
 if(!event||event.type==='input')$('open-error').textContent='';
 const field=$('pin');field.value=field.value.replace(/[^0-9]/g,'').slice(0,6);
 $('pin-code').removeAttribute('data-phase');field.removeAttribute('aria-invalid');
 const at=Math.min(5,field.selectionStart??field.value.length);$('pin-code').style.setProperty('--pin-at',at);
 document.querySelectorAll('.pin-cells span').forEach((cell,i)=>{const digit=field.value[i]||'';if(cell.textContent!==digit){cell.textContent=digit;cell.animate([{opacity:0,translate:'0 6px'},{opacity:1,translate:'0 0'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:220,easing:'ease-out'});}});
 $('pin-code').classList.toggle('complete',field.value.length===6);
}
for(const event of ['input','click','keyup','focus'])$('pin').addEventListener(event,drawPin);
edit=editorMenu({copy,t,notify:line=>{if(!line)line=t('menuHint');say(line);},inspect:()=>{
 musicSend({action:'pause'});stopVoice();receivedPlayer?.pause();stopBubbles();$('privacy-warning').showModal();document.body.classList.add('privacy-paused');
}});
$('privacy-warning').addEventListener('close',()=>{document.body.classList.remove('privacy-paused');resumeBubbles();});
companion('compose');
route();
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',()=>{routeGeneration++;stopBubbles();forget();});
window.addEventListener('pageshow',e=>{if(e.persisted)ended('cleared');});
