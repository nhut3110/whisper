import {test} from 'node:test';import assert from 'node:assert/strict';
import {encrypt,decrypt,random,validFile,parseInvite,parseContent,safeURL,FILE_LIMIT} from '../frontend/chat/crypto.ts';
test('chat encrypts text and binds ciphertext to room and attachment purpose',async()=>{
 const key=random(),room=random(),bytes=new TextEncoder().encode('Only the room can read 🫧');const box=await encrypt(bytes,key,room);
 assert.deepEqual(await decrypt(box.ciphertext,box.iv,key,room),bytes);
 await assert.rejects(decrypt(box.ciphertext,box.iv,key,random()));await assert.rejects(decrypt(box.ciphertext,box.iv,key,room,'file'));await assert.rejects(decrypt(box.ciphertext,box.iv,random(),room));
 assert.notEqual((await encrypt(bytes,key,room)).iv,box.iv);
});
test('files have a small hard cap and extension plus signature checks; active formats are rejected',()=>{
 const e=new TextEncoder();assert.equal(validFile('hello.txt',e.encode('hello 🌊')),'text/plain');assert.equal(validFile('report.csv',e.encode('a,b\n1,2')),'text/csv');
 for(const name of ['bad.html','image.svg','run.exe','archive.zip','fake.png','fake.pdf'])assert.equal(validFile(name,e.encode('<script>alert(1)</script>')),null);
 assert.equal(validFile('empty.txt',new Uint8Array()),null);assert.equal(validFile('huge.txt',new Uint8Array(FILE_LIMIT+1)),null);assert.equal(validFile('binary.txt',new Uint8Array([0,1,2])),null);
 assert.equal(validFile('paper.pdf',e.encode('%PDF-1.7\n')),'application/pdf');
});
test('room invites require three independent canonical capabilities; link rendering rejects unsafe schemes',()=>{
 const r=random(),a=random(),k=random();assert.deepEqual(parseInvite(`#r=${r}&a=${a}&k=${k}`),{id:r,access:a,key:k});assert.throws(()=>parseInvite('#r=short'));assert.throws(()=>parseInvite(`#r=${r}&a=${a}&k=${'Z'.repeat(43)}`));
 assert.equal(safeURL('javascript:alert(1)'),null);assert.equal(safeURL('data:text/html,x'),null);assert.equal(safeURL('https://user:pass@example.com'),null);assert.equal(safeURL('https://example.com/path')?.hostname,'example.com');
});

test('a participant cannot crash the message tree with malformed encrypted attachment metadata',()=>{
 const parse=value=>parseContent(new TextEncoder().encode(JSON.stringify(value)));
 for(const value of [null,[],{text:{}},{text:'x'.repeat(4001)},{text:'ok',file:{name:{nested:true},size:1,type:'text/plain'}},{text:'ok',file:{name:'../bad.txt',size:1,type:'text/plain'}},{text:'ok',file:{name:'bad.html',size:1,type:'text/html'}},{text:'ok',file:{name:'big.txt',size:FILE_LIMIT+1,type:'text/plain'}}])assert.throws(()=>parse(value));
 assert.deepEqual(parse({text:'hi',file:{name:'note.txt',size:2,type:'text/plain',untrusted:'ignored'}}),{text:'hi',file:{name:'note.txt',size:2,type:'text/plain'}});
});
