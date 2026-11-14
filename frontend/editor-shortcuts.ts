/** Shared by keyboard routing and hover hints so advertised keys match behavior. */
export const inlineShortcuts=[
 {key:'b',selector:'[data-command=bold]',shift:false},
 {key:'i',selector:'[data-command=italic]',shift:false},
 {key:'u',selector:'[data-command=underline]',shift:false},
 {key:'s',selector:'[data-command=strikeThrough]',shift:true},
 {key:'p',selector:'[data-inline=spoiler]',shift:true},
 {key:'e',selector:'[data-inline=code]',shift:false},
 {key:'k',selector:'[data-inline=link]',shift:false},
 {key:'\\',selector:'[data-command=removeFormat]',shift:false},
] as const
export const blockShortcutKeys=['text','h1','h2','h3','task','bullet','number','toggle','code','quote']
export const isMac=()=>/Mac|iPhone|iPad|iPod/.test(navigator.platform)
export function shortcutLabel(key:string,{shift=false,alt=false}:{shift?:boolean;alt?:boolean}={}){
 return isMac()?`⌘${alt?'⌥':''}${shift?'⇧':''}${key.toUpperCase()}`:`Ctrl+${alt?'Alt+':''}${shift?'Shift+':''}${key.toUpperCase()}`
}
export function shortcutTarget(event:KeyboardEvent){
 if(event.isComposing||event.altKey||(isMac()?(!event.metaKey||event.ctrlKey):(!event.ctrlKey||event.metaKey)))return null
 const key=event.key.toLowerCase()
 return inlineShortcuts.find(item=>item.key===key&&item.shift===event.shiftKey)?.selector||null
}
export function installShortcutHints(toolbar:HTMLElement){
 const entries=inlineShortcuts.map(item=>({element:toolbar.querySelector<HTMLElement>(item.selector)!,label:shortcutLabel(item.key,item),aria:`${isMac()?'Meta':'Control'}+${item.shift?'Shift+':''}${item.key.toUpperCase()}`}))
 const turn=toolbar.querySelector<HTMLElement>('#block-type-picker')!
 const sync=()=>{
  for(const {element,label,aria} of entries){const base=element.getAttribute('aria-label')||element.title.split(' · ')[0];element.title=`${base} · ${label}`;element.setAttribute('aria-keyshortcuts',aria)}
  const vi=document.documentElement.lang.startsWith('vi');
  for(const id of ['message','rich-editor'])document.getElementById(id)!.title=vi?'Enter: dòng mới · Shift+Enter: xuống dòng trong block · /: chọn kiểu · Esc: thoát định dạng':'Enter: new line/block · Shift+Enter: line break · /: block menu · Esc: leave formatting';
  const insert=document.getElementById('insert-block')!;insert.title=`${insert.getAttribute('aria-label')||''} · /`;
  const move=document.getElementById('move-block')!;move.title=`${move.getAttribute('aria-label')||''} · ↑ / ↓`;
  turn.title=`${turn.getAttribute('aria-label')||turn.title.split(' · ')[0]} · ${shortcutLabel('0',{alt:true})}–9`
 }
 sync();window.addEventListener('whisper-languagechange',sync)
 const duplicate=document.querySelector<HTMLElement>('[data-block-action=duplicate]')
 if(duplicate){const hint=()=>{duplicate.title=`${duplicate.textContent?.trim()} · ${shortcutLabel('d',{shift:true})}`};hint();window.addEventListener('whisper-languagechange',hint)}
}
