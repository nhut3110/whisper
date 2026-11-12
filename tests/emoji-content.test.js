import {test} from 'node:test';import assert from 'node:assert/strict';import {emojiOnlyCount} from '../frontend/chat/emoji/content.ts';
test('emoji-only display counts full emoji graphemes and known custom tokens',()=>{
 for(const [value,count] of [['🥰',1],['🥰\n🥲',2],['👩🏽‍🚀 🇻🇳 👨‍👩‍👧‍👦',3],['1️⃣ #️⃣',2],[':pepe_preview_happy: ❤️',2],[':whisper_hello:',1]])assert.equal(emojiOnlyCount(value),count,value)
});
test('text, punctuation, bare numbers, unknown custom tokens and whitespace keep normal message styling',()=>{
 for(const value of ['haha 😂','hello','123','#','', '  ',':unknown_pack:','whisper_hello','❤️!'])assert.equal(emojiOnlyCount(value),0,value)
});
