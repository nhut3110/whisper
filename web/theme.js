// Only a non-sensitive appearance preference is persisted. No message data is stored.
(()=>{
 const root=document.documentElement,system=matchMedia('(prefers-color-scheme: dark)');
 let preference=null,transition=null,castingTimer=0;
 try{const stored=localStorage.getItem('whisper-theme');if(stored==='dark'||stored==='light')preference=stored;}catch{}
 function apply(){
  const dark=(preference||(system.matches?'dark':'light'))==='dark';
  root.dataset.theme=dark?'dark':'light';
  const button=document.getElementById('theme-toggle');
  if(button){const label=dark?'Chuyển sang chế độ sáng':'Chuyển sang chế độ tối';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));}
 }
 apply();
 system.addEventListener('change',()=>{if(!preference)apply();});
 document.addEventListener('whisper:mounted',()=>{
  apply();document.getElementById('theme-toggle')?.addEventListener('click',()=>document.dispatchEvent(new Event('whisper:theme-toggle')));
 });
 document.addEventListener('whisper:theme-toggle',async()=>{
   preference=(preference||root.dataset.theme)==='dark'?'light':'dark';
   try{localStorage.setItem('whisper-theme',preference);}catch{}
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   transition?.skipTransition();
   if(reduced){apply();return;}
   const bot=document.body.classList.contains('integrated-chat')?document.querySelector('.chat-companion .eyt'):document.getElementById('create'),rect=bot?.getBoundingClientRect()||{x:innerWidth-48,y:innerHeight-48,width:0,height:0},x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   clearTimeout(castingTimer);document.body.classList.add('theme-casting');
   castingTimer=setTimeout(()=>document.body.classList.remove('theme-casting'),750);
   // Capture both same-origin documents in one snapshot; synchronizing the
   // iframe here prevents its old palette flashing through the reveal.
   const update=()=>{apply();const frame=document.getElementById('music-frame');if(frame?.contentDocument?.documentElement)frame.contentDocument.documentElement.dataset.theme=root.dataset.theme;};
   if(!document.startViewTransition){document.body.classList.add('theme-soft');update();return;}
   const own=transition=document.startViewTransition(update);
   try{await own.ready;if(transition!==own)return;
    const radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
    await root.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},{duration:650,easing:'cubic-bezier(.22,1,.36,1)',pseudoElement:'::view-transition-new(root)'}).finished;
   }catch{}finally{if(transition===own)transition=null;}
 });
})();
