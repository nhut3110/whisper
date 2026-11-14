import {test} from 'node:test';import assert from 'node:assert/strict';
import {shareURL} from '../frontend/optical/protocol.ts';
import {decodeFrame} from '../frontend/optical/decoder.ts';
const origin='https://whisper.example',url=origin+'/s/'+'a'.repeat(16)+'#'+'A'.repeat(22);
test('optical capabilities keep fragments local and allow only complete same-origin message/room links',()=>{
 assert.equal(shareURL(url,origin),url);
 const room=origin+'/?mode=chat#r='+'A'.repeat(43)+'&a='+'B'.repeat(42)+'A&k='+'C'.repeat(42)+'A';assert.equal(shareURL(room,origin),room);
 for(const bad of [url.replace('whisper.example','evil.example'),url.replace('#','#x'),url.replace('#','?q=leak#'),url.replace('/s/','/revoke/'),'javascript:alert(1)',origin+'/@evil',url+'x',origin+'/?mode=chat#r=bad',url.replace('https://','https://user:pass@')])assert.equal(shareURL(bad,origin),null,bad);
 assert.equal(shareURL(origin+'/s/'+'a'.repeat(16)+'#'+'A'.repeat(21)+'B',origin),null); // noncanonical base64 trailing bits
});
test('decoder rejects oversized/malformed frames and unrelated images',()=>{
 assert.equal(decodeFrame(new Uint8ClampedArray(),1000,1000),null);assert.equal(decodeFrame(new Uint8ClampedArray(10),21,21),null);assert.equal(decodeFrame(new Uint8ClampedArray(100*100*4),100,100),null);
});
