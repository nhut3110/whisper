// Only a non-sensitive appearance preference is persisted. No message data is stored.
(()=>{
 const root=document.documentElement,system=matchMedia('(prefers-color-scheme: dark)');
 let preference=null;
 try{const stored=localStorage.getItem('whisper-theme');if(stored==='dark'||stored==='light')preference=stored;}catch{}
 function apply(){
  const dark=(preference||(system.matches?'dark':'light'))==='dark';
  root.dataset.theme=dark?'dark':'light';
  const button=document.getElementById('theme-toggle');
  if(button){const label=dark?'Chuyển sang chế độ sáng':'Chuyển sang chế độ tối';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));}
 }
 apply();
 system.addEventListener('change',()=>{if(!preference)apply();});
 document.addEventListener('DOMContentLoaded',()=>{
  apply();document.getElementById('theme-toggle').addEventListener('click',()=>{
   preference=root.dataset.theme==='dark'?'light':'dark';
   try{localStorage.setItem('whisper-theme',preference);}catch{}
   apply();
  });
 });
})();
