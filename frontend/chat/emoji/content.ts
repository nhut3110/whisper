import packs from '../../../shared/emoji-packs.json' with {type:'json'}
const custom=new Set(packs.flatMap(pack=>pack.emojis.map(emoji=>`:${emoji.id}:`)))
const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'})
let native:RegExp
try{native=new RegExp('^\\p{RGI_Emoji}$','v')}catch{native=/^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F|\p{Emoji_Modifier})?)*)$/u}
/** Count graphemes, not code units: flags, skin tones and ZWJ families count as one. */
export function emojiOnlyCount(text:string):number{
 let count=0
 for(const part of text.trim().split(/(:[a-z][a-z0-9_]{0,95}:)/g)){
  if(custom.has(part)){count++;continue}
  for(const {segment} of segments.segment(part)){if(/^\s+$/u.test(segment))continue;if(!native.test(segment))return 0;count++}
 }
 return count
}
