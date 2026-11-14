/** Only local Whisper share capabilities are accepted, never arbitrary URLs. */
export function shareURL(value:string,origin:string):string|null{
 if(value.length>512)return null;
 try{
  const url=new URL(value);if(url.origin!==origin||url.username||url.password)return null;
  const token=(v:string|null,bytes:number)=>{if(!v||!new RegExp(`^[A-Za-z0-9_-]{${bytes===16?22:43}}$`).test(v))return false;const raw=atob(v.replace(/-/g,'+').replace(/_/g,'/'));return raw.length===bytes&&btoa(raw).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')===v};
  if(/^\/s\/[A-Za-z0-9_-]{16}$/.test(url.pathname)&&!url.search&&token(url.hash.slice(1),16))return url.href;
  const params=new URLSearchParams(url.hash.slice(1));
  if(url.pathname==='/'&&url.search==='?mode=chat'&&[...params].length===3&&['r','a','k'].every(k=>token(params.get(k),32)))return url.href;
 }catch{}
 return null;
}
