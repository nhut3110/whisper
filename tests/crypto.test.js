import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal,randomToken,randomPin,readLink,b64,unb64} from '../web/crypto.js';
test('AES-GCM round trip preserves Vietnamese, emoji and multiline',async()=>{const t='Chỉ giữa chúng ta 🐚\n秘密\n<script>alert(1)</script>';const v=await seal(t);assert.equal(await unseal(v.ciphertext,v.iv,v.key),t);assert.ok(!v.ciphertext.includes('chúng'));});
test('each encryption uses a fresh key and IV',async()=>{const a=await seal('same');const b=await seal('same');assert.notEqual(a.key,b.key);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);});
test('wrong key, altered ciphertext and IV fail closed',async()=>{const a=await seal('private');await assert.rejects(unseal(a.ciphertext,a.iv,randomToken()));const bytes=unb64(a.ciphertext);bytes[0]^=1;await assert.rejects(unseal(b64(bytes),a.iv,a.key));await assert.rejects(unseal(a.ciphertext,b64(new Uint8Array(12)),a.key));await assert.rejects(unseal(a.ciphertext,a.iv,'AA'));});
test('plaintext bounds use UTF-8 bytes',async()=>{await assert.rejects(seal('  '));await assert.rejects(seal('🐚'.repeat(65537)));assert.ok(await seal('a'.repeat(262144)));});
test('link secrets validate without network',()=>{const key=randomToken(),access=randomToken();assert.deepEqual(readLink(`#k=${key}&a=${access}`),{key,access});for(const s of ['','#k=AA','#k=AA&a=AA','#k=!&a=!'])assert.throws(()=>readLink(s));assert.throws(()=>unb64('!'));assert.throws(()=>unb64(null));});
test('tokens and PINs have correct format and entropy sources',()=>{const set=new Set();for(let i=0;i<1000;i++){set.add(randomToken());assert.match(randomPin(),/^\d{6}$/);}assert.equal(set.size,1000);});

test('short links deterministically derive independent secrets with 128-bit seeds',async()=>{
 const {newShortLink,deriveShortLink}=await import('../web/crypto.js');
 const a=await newShortLink(),b=await deriveShortLink(a.seed),c=await newShortLink();
 assert.match(a.seed,/^[A-Za-z0-9_-]{22}$/);assert.deepEqual(a,b);assert.notEqual(a.seed,c.seed);
 assert.equal(new Set([a.key,a.access,a.id]).size,3);
 for(const value of [a.key,a.access,a.id])assert.equal(unb64(value).length,32);
 const sealed=await seal('Link ngắn bí mật 🐚',a.key);assert.equal(sealed.key,a.key);
 assert.equal(await unseal(sealed.ciphertext,sealed.iv,b.key),'Link ngắn bí mật 🐚');
 await assert.rejects(unseal(sealed.ciphertext,sealed.iv,c.key));
 for(const bad of ['', '!', 'A'.repeat(21),'A'.repeat(23),'A'.repeat(21)+'B',randomToken()])await assert.rejects(deriveShortLink(bad));
});

test('short-link v1 matches fixed independent Node HKDF vectors',async()=>{
 const {deriveShortLink}=await import('../web/crypto.js');
 // Generated independently with node:crypto hkdfSync; keeps existing short URLs stable.
 assert.deepEqual(await deriveShortLink('AAAAAAAAAAAAAAAAAAAAAA'),{
  seed:'AAAAAAAAAAAAAAAAAAAAAA',
  key:'3aVrviD4RSeUFJfZStGao9TkHYVpwd56L5KfyIgMlPs',
  access:'ttN5d-IthaBoE0qECRRXVDdu7YWSMynn2QxL5WMKbHA',
  id:'s4iZYEOCNZxsf0fpRVLDDsZospJWLowq9JtapXcIqrU',
 });
});

test('binary audio encryption accepts 2 MiB without base64 stack overflow and rejects oversized data',async()=>{
 const {sealBytes,unsealBytes,BINARY_LIMIT}=await import('../web/crypto.js');
 const bytes=new Uint8Array(BINARY_LIMIT);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const encrypted=await sealBytes(bytes);assert.deepEqual(await unsealBytes(encrypted.ciphertext,encrypted.iv,encrypted.key),bytes);
 assert.deepEqual(unb64(b64(bytes)),bytes);await assert.rejects(sealBytes(new Uint8Array(0)));await assert.rejects(sealBytes(new Uint8Array(BINARY_LIMIT+1)));await assert.rejects(sealBytes('not binary'));
 await assert.rejects(unsealBytes(encrypted.ciphertext,encrypted.iv,randomToken()));
});
