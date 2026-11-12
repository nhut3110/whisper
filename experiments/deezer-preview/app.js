import {watcher} from '/interactions.js';
let musicLocale='vi';
const english={"Chọn bài khác": "Choose another song", "Trở về bản chốt": "Back to your selection", "Nhạc gửi đến bạn": "A song for you", "Nhạc đã chọn": "Selected song", "Bấm vào bìa đĩa hoặc bot để nghe.": "Tap the record or mascot to listen.", "Phát bản nghe thử": "Play preview", "Tạm dừng": "Pause", "Chưa phát được. Bấm thử lại hoặc nghe trên Deezer nhé.": "Could not play. Try again or listen on Deezer.", "Đang tìm…": "Searching…", "Chọn": "Choose", "Không có preview": "No preview", "Chọn một bài để nghe preview.": "Choose a song to preview.", "Không có kết quả. Thử tên khác nhé.": "No results. Try another search.", "Không tìm được. Thử lại nhé.": "Search failed. Please try again.", "Đang chờ nhạc…": "Loading music…", "Đang phát.": "Playing.", "Đã tạm dừng.": "Paused.", "Đã hết bản nghe thử. Bấm để nghe lại.": "Preview ended. Tap to replay.", "Chưa phát được. Bạn có thể mở trên Deezer.": "Could not play. You can listen on Deezer.", "Không tải được bài hát. Thử mở lại sau nhé.": "Could not load this song. Please try later.", "Chọn một bài nhạc.": "Choose a song.", "Tên bài hát hoặc nghệ sĩ": "Song or artist", "Tìm bài hát, nghệ sĩ…": "Search songs, artists…", "Tìm": "Search", "Tìm một bài bạn muốn gửi.": "Find a song to send.", "Kết quả tìm kiếm": "Search results", "Mình chuẩn bị hát một bài cho bạn…": "I’m getting a song ready for you…", "Deezer · bản nghe thử tối đa 30 giây": "Deezer · previews up to 30 seconds"};
const tr=text=>musicLocale==='vi'?text:(english[text]||text);
const originalText=new WeakMap(),originalAttrs=new WeakMap();
function localize(){
 const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let node;node=walk.nextNode();){if(node.parentElement.closest('script,style,#title,#artist,#results,#playback,#status'))continue;if(!originalText.has(node))originalText.set(node,node.nodeValue);const text=originalText.get(node);if(english[text])node.nodeValue=tr(text);}
 for(const el of document.querySelectorAll('[aria-label],[placeholder]')){if(el.closest('#results'))continue;if(!originalAttrs.has(el))originalAttrs.set(el,{label:el.getAttribute('aria-label'),placeholder:el.getAttribute('placeholder')});const old=originalAttrs.get(el);if(english[old.label])el.setAttribute('aria-label',tr(old.label));if(english[old.placeholder])el.setAttribute('placeholder',tr(old.placeholder));}
}
const $=id=>document.getElementById(id),audio=$('audio');let generation=0,searchController;
const face=watcher($('music-bot'));face.gear('singing');face.expression('happy');
const embedded=new URLSearchParams(location.search).has('embed');
function tell(action,ref=null){if(embedded)parent.postMessage({whisperMusic:1,action,ref},location.origin);}
function reportPose(){if(!embedded)return;requestAnimationFrame(()=>{const r=$('music-bot').getBoundingClientRect();parent.postMessage({whisperMusic:1,action:'pose',screen,x:r.left+r.width/2,y:r.top,size:r.width,playing:!audio.paused&&!audio.ended,intro:$('selected').classList.contains('is-intro')?tr('Mình chuẩn bị hát một bài cho bạn…'):null},location.origin);});}
if(embedded){document.body.classList.add('embedded');$('recipient-preview').remove();}
let screen='library',lastChoice=null,mediaGeneration=0,introTimer=0,introAnimation=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function cancelIntro(){clearTimeout(introTimer);introAnimation?.cancel();introAnimation=null;$('selected').dataset.intro='ready';$('selected').classList.remove('is-intro');$('intro-line').hidden=true;reportPose();}
function introduce(){
 cancelIntro();$('selected').dataset.intro='pending';const token=mediaGeneration;$('selected').classList.add('is-intro');$('intro-line').hidden=false;face.expression('happy');reportPose();
 introTimer=setTimeout(()=>{
  if(token!==mediaGeneration||screen==='library')return;
  const bot=$('music-bot'),before=bot.getBoundingClientRect();
  $('selected').classList.remove('is-intro');$('intro-line').hidden=true;
  const after=bot.getBoundingClientRect();reportPose();
  if(!reduced&&!embedded)introAnimation=bot.animate([{transform:`translateY(${before.top-after.top}px) scale(1.45)`},{transform:'translateY(0) scale(1)'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'});
  introTimer=setTimeout(()=>{if(token===mediaGeneration&&screen!=='library'&&!document.hidden)toggle();},reduced?0:650);
 },reduced?800:1900);
}
function notice(message,error=false){$('playback').textContent=message;$('playback').classList.toggle('sr-only',!error);}
function screenTo(next){
 cancelIntro();mediaGeneration++;audio.pause();if(audio.readyState>=1)audio.currentTime=0;state(false);screen=next;document.body.dataset.screen=next;
 $('library').hidden=next!=='library';$('selected').hidden=next==='library';$('player-header').hidden=next==='library';
 if(!embedded)$('recipient-preview').hidden=next!=='confirm';$('back').setAttribute('aria-label',next==='recipient'?tr('Trở về bản chốt'):tr('Chọn bài khác'));
 $('screen-title').textContent=next==='recipient'?tr('Nhạc gửi đến bạn'):tr('Nhạc đã chọn');$('selected').setAttribute('aria-label',$('screen-title').textContent);
 notice(tr('Bấm vào bìa đĩa hoặc bot để nghe.'));window.scrollTo(0,0);
 if(next==='library'){tell('select');stop();(lastChoice||$('query')).focus({preventScroll:true});}
 else {$('screen-title').focus({preventScroll:true});introduce();}
 reportPose();
}
$('back').addEventListener('click',()=>screenTo(screen==='recipient'?'confirm':'library'));
$('recipient-preview')?.addEventListener('click',()=>screenTo('recipient'));
function state(on){
 if(embedded)parent.postMessage({whisperMusic:1,action:'performance',playing:on},location.origin);
 $('selected').classList.toggle('is-playing',on);face.expression(on?'playing':'happy');
 const label=audio.paused||audio.ended?tr('Phát bản nghe thử'):tr('Tạm dừng');
 for(const id of ['play-toggle','music-bot'])$(id).setAttribute('aria-label',label);
 $('play-icon').toggleAttribute('hidden',!audio.paused&&!audio.ended);$('pause-icon').toggleAttribute('hidden',audio.paused||audio.ended);
 $('play-toggle').setAttribute('aria-busy',String(!audio.paused&&!on&&!audio.ended));
}
async function toggle(){
 if(!audio.hasAttribute('src'))return;
 cancelIntro();
 if(!audio.paused&&!audio.ended){audio.pause();state(false);return;}
 if(audio.ended)audio.currentTime=0;
 const attempt=mediaGeneration;
 try{await audio.play();}catch(error){if(attempt!==mediaGeneration||error.name==='AbortError')return;state(false);notice(tr('Chưa phát được. Bấm thử lại hoặc nghe trên Deezer nhé.'),true);}
}
$('play-toggle').addEventListener('click',toggle);$('music-bot').addEventListener('click',toggle);
function stop(){cancelIntro();mediaGeneration++;audio.pause();audio.removeAttribute('src');audio.load();state(false);notice('');}
function choose(track){tell('select',{provider:'deezer',id:track.id});
 stop();$('title').textContent=track.title;$('artist').textContent=track.artist;$('source').href=track.url;
 for(const id of ['art','record-art']){$(id).hidden=!track.cover;if(track.cover)$(id).src=track.cover;else $(id).removeAttribute('src');}$('title').title=track.title;
 audio.src=track.preview;screenTo('confirm');
 for(const button of $('results').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.id===String(track.id)));
}
$('search').addEventListener('submit',async event=>{
 event.preventDefault();const q=$('query').value.trim();if(q.length<2||q.length>120)return;
 const current=++generation;searchController?.abort();searchController=new AbortController();stop();$('selected').hidden=true;$('results').replaceChildren();$('submit').disabled=true;$('status').textContent=tr('Đang tìm…');
 try{
  const r=await fetch('/api/search?q='+encodeURIComponent(q),{signal:searchController.signal});const data=await r.json();if(current!==generation)return;if(!r.ok)throw new Error(data.error);
  for(const track of data.tracks){
   const row=document.createElement('li'),button=document.createElement('button');button.type='button';button.dataset.id=track.id;button.setAttribute('aria-pressed','false');button.disabled=!track.preview;
   if(track.cover){const img=document.createElement('img');img.src=track.cover;img.alt='';img.loading='lazy';img.decoding='async';button.append(img);}
   const info=document.createElement('span');info.className='info';const title=document.createElement('strong');title.textContent=track.title;const artist=document.createElement('small');artist.textContent=track.artist;info.append(title,artist);
   const label=document.createElement('span');label.className='pick';if(track.preview){label.setAttribute('aria-hidden','true');label.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';}else label.textContent=tr('Không có preview');button.append(info,label);button.addEventListener('click',()=>{lastChoice=button;choose(track);});row.append(button);$('results').append(row);
  }
  $('status').textContent=data.tracks.length?tr('Chọn một bài để nghe preview.'):tr('Không có kết quả. Thử tên khác nhé.');
 }catch(error){if(current===generation&&error.name!=='AbortError')$('status').textContent=error.message||tr('Không tìm được. Thử lại nhé.');}
 finally{if(current===generation)$('submit').disabled=false;}
});
audio.addEventListener('play',()=>{state(false);notice(tr('Đang chờ nhạc…'));});
audio.addEventListener('playing',()=>{state(true);notice(tr('Đang phát.'));});
audio.addEventListener('pause',()=>{state(false);if(audio.hasAttribute('src')&&!audio.ended)notice(tr('Đã tạm dừng.'));});
for(const event of ['waiting','seeking'])audio.addEventListener(event,()=>{state(false);if(!audio.paused)notice(tr('Đang chờ nhạc…'));});
audio.addEventListener('canplay',()=>{if(!audio.paused&&!audio.ended){state(true);notice(tr('Đang phát.'));}});
audio.addEventListener('ended',()=>{state(false);notice(tr('Đã hết bản nghe thử. Bấm để nghe lại.'));});
audio.addEventListener('error',()=>{state(false);if(audio.hasAttribute('src'))notice(tr('Chưa phát được. Bạn có thể mở trên Deezer.'),true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelIntro();audio.pause();}});
window.addEventListener('pagehide',()=>{searchController?.abort();stop();});

let receiveID=null;
window.addEventListener('message',async event=>{
 if(!embedded||event.origin!==location.origin||event.source!==parent||event.data?.whisperMusic!==1)return;
 const data=event.data;
 if(data.action==='pose')reportPose();
 if(data.action==='toggle'){toggle();reportPose();}
 if(data.action==='pause'){cancelIntro();audio.pause();}
 if(data.action==='clear'){receiveID=null;screenTo('library');$('back').hidden=false;$('play-toggle').disabled=false;}
 if(data.action==='appearance'){document.documentElement.dataset.theme=data.theme||'light';document.documentElement.lang=data.locale||'en';musicLocale=data.locale==='vi'?'vi':'en';localize();}
 if(data.action==='receive'&&data.ref?.provider==='deezer'&&Number.isSafeInteger(data.ref.id)&&data.ref.id>0&&data.ref.id!==receiveID){
  receiveID=data.ref.id;const id=receiveID;stop();$('library').hidden=true;
  try{const r=await fetch('/api/search?id='+id);const result=await r.json();if(id!==receiveID)return;if(!r.ok||!result.tracks?.[0]?.preview)throw Error();choose(result.tracks[0]);screen='recipient';document.body.dataset.screen='recipient';$('back').hidden=true;}catch{notice(tr('Không tải được bài hát. Thử mở lại sau nhé.'),true);$('selected').hidden=false;$('play-toggle').disabled=true;}
 }
});
if(embedded){new ResizeObserver(reportPose).observe($('selected'));window.addEventListener('resize',reportPose);window.addEventListener('scroll',reportPose,{passive:true});}
tell('ready');

// The form is inert until its module and event handlers are ready.
$('submit').disabled=false;

// Text fields match :focus-visible on mouse clicks too; show the group ring
// only after keyboard navigation, never on pointer focus.
document.addEventListener('keydown',event=>{if(event.key==='Tab')document.body.dataset.keyboard='';});
document.addEventListener('pointerdown',()=>{delete document.body.dataset.keyboard;},true);
