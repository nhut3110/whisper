import {watcher} from '/interactions.js';
const $=id=>document.getElementById(id),audio=$('audio');let generation=0,searchController;
const face=watcher($('music-bot'));face.gear('singing');face.expression('happy');
let screen='library',lastChoice=null,mediaGeneration=0,introTimer=0,introAnimation=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function cancelIntro(){clearTimeout(introTimer);introAnimation?.cancel();introAnimation=null;$('selected').dataset.intro='ready';$('selected').classList.remove('is-intro');$('intro-line').hidden=true;}
function introduce(){
 cancelIntro();$('selected').dataset.intro='pending';const token=mediaGeneration;$('selected').classList.add('is-intro');$('intro-line').hidden=false;face.expression('happy');
 introTimer=setTimeout(()=>{
  if(token!==mediaGeneration||screen==='library')return;
  const bot=$('music-bot'),before=bot.getBoundingClientRect();
  $('selected').classList.remove('is-intro');$('intro-line').hidden=true;
  const after=bot.getBoundingClientRect();
  if(!reduced)introAnimation=bot.animate([{transform:`translateY(${before.top-after.top}px) scale(1.45)`},{transform:'translateY(0) scale(1)'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'});
  introTimer=setTimeout(()=>{if(token===mediaGeneration&&screen!=='library'&&!document.hidden)toggle();},reduced?0:650);
 },reduced?800:1900);
}
function notice(message,error=false){$('playback').textContent=message;$('playback').classList.toggle('sr-only',!error);}
function screenTo(next){
 cancelIntro();mediaGeneration++;audio.pause();if(audio.readyState>=1)audio.currentTime=0;state(false);screen=next;document.body.dataset.screen=next;
 $('library').hidden=next!=='library';$('selected').hidden=next==='library';$('player-header').hidden=next==='library';
 $('recipient-preview').hidden=next!=='confirm';$('back').setAttribute('aria-label',next==='recipient'?'Trở về bản chốt':'Chọn bài khác');
 $('screen-title').textContent=next==='recipient'?'Nhạc gửi đến bạn':'Nhạc đã chọn';$('selected').setAttribute('aria-label',$('screen-title').textContent);
 notice('Bấm vào bìa đĩa hoặc bot để nghe.');window.scrollTo(0,0);
 if(next==='library'){stop();(lastChoice||$('query')).focus({preventScroll:true});}
 else {$('screen-title').focus({preventScroll:true});introduce();}
}
$('back').addEventListener('click',()=>screenTo(screen==='recipient'?'confirm':'library'));
$('recipient-preview').addEventListener('click',()=>screenTo('recipient'));
function state(on){
 $('selected').classList.toggle('is-playing',on);face.expression(on?'playing':'happy');
 const label=audio.paused||audio.ended?'Phát bản nghe thử':'Tạm dừng';
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
 try{await audio.play();}catch(error){if(attempt!==mediaGeneration||error.name==='AbortError')return;state(false);notice('Chưa phát được. Bấm thử lại hoặc nghe trên Deezer nhé.',true);}
}
$('play-toggle').addEventListener('click',toggle);$('music-bot').addEventListener('click',toggle);
function stop(){cancelIntro();mediaGeneration++;audio.pause();audio.removeAttribute('src');audio.load();state(false);notice('');}
function choose(track){
 stop();$('title').textContent=track.title;$('artist').textContent=track.artist;$('source').href=track.url;
 for(const id of ['art','record-art']){$(id).hidden=!track.cover;if(track.cover)$(id).src=track.cover;else $(id).removeAttribute('src');}$('title').title=track.title;
 audio.src=track.preview;screenTo('confirm');
 for(const button of $('results').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.id===String(track.id)));
}
$('search').addEventListener('submit',async event=>{
 event.preventDefault();const q=$('query').value.trim();if(q.length<2||q.length>120)return;
 const current=++generation;searchController?.abort();searchController=new AbortController();stop();$('selected').hidden=true;$('results').replaceChildren();$('submit').disabled=true;$('status').textContent='Đang tìm…';
 try{
  const r=await fetch('/api/search?q='+encodeURIComponent(q),{signal:searchController.signal});const data=await r.json();if(current!==generation)return;if(!r.ok)throw new Error(data.error);
  for(const track of data.tracks){
   const row=document.createElement('li'),button=document.createElement('button');button.type='button';button.dataset.id=track.id;button.setAttribute('aria-pressed','false');button.disabled=!track.preview;
   if(track.cover){const img=document.createElement('img');img.src=track.cover;img.alt='';img.loading='lazy';img.decoding='async';button.append(img);}
   const info=document.createElement('span');info.className='info';const title=document.createElement('strong');title.textContent=track.title;const artist=document.createElement('small');artist.textContent=track.artist;info.append(title,artist);
   const label=document.createElement('span');label.className='pick';label.textContent=track.preview?'Chọn':'Không có preview';button.append(info,label);button.addEventListener('click',()=>{lastChoice=button;choose(track);});row.append(button);$('results').append(row);
  }
  $('status').textContent=data.tracks.length?'Chọn một bài để nghe preview.':'Không có kết quả. Thử tên khác nhé.';
 }catch(error){if(current===generation&&error.name!=='AbortError')$('status').textContent=error.message||'Không tìm được. Thử lại nhé.';}
 finally{if(current===generation)$('submit').disabled=false;}
});
audio.addEventListener('play',()=>{state(false);notice('Đang chờ nhạc…');});
audio.addEventListener('playing',()=>{state(true);notice('Đang phát.');});
audio.addEventListener('pause',()=>{state(false);if(audio.hasAttribute('src')&&!audio.ended)notice('Đã tạm dừng.');});
for(const event of ['waiting','seeking'])audio.addEventListener(event,()=>{state(false);if(!audio.paused)notice('Đang chờ nhạc…');});
audio.addEventListener('canplay',()=>{if(!audio.paused&&!audio.ended){state(true);notice('Đang phát.');}});
audio.addEventListener('ended',()=>{state(false);notice('Đã hết bản nghe thử. Bấm để nghe lại.');});
audio.addEventListener('error',()=>{state(false);if(audio.hasAttribute('src'))notice('Chưa phát được. Bạn có thể mở trên Deezer.',true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelIntro();audio.pause();}});
window.addEventListener('pagehide',()=>{searchController?.abort();stop();});
