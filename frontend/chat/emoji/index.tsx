import packs from '../../../shared/emoji-packs.json'
export const customPacks=packs
const entries=new Map(packs.flatMap(p=>p.emojis.map(e=>[e.id,e] as const)))
export const customEmoji=(value:string)=>/^:[a-z][a-z0-9_]{0,95}:$/.test(value)?entries.get(value.slice(1,-1)):undefined
export function EmojiGlyph({value}:{value:string}){const e=customEmoji(value);return e?<img className="chat-custom-emoji" src={e.src} alt={`:${e.id}:`} draggable={false}/>:<>{value}</>}
export function EmojiText({text}:{text:string}){return <>{text.split(/(:[a-z][a-z0-9_]{0,95}:)/g).map((v,i)=><EmojiGlyph key={i} value={v}/>)}</>}
