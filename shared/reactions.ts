import unicode from './unicode-emoji.json' with {type:'json'};
import packs from './emoji-packs.json' with {type:'json'};
const allowed=new Set<string>([...unicode,...packs.flatMap(p=>p.emojis.map(e=>`:${e.id}:`))]);
export function validReaction(value:unknown):value is string{return typeof value==='string'&&value.length<=96&&allowed.has(value)}
