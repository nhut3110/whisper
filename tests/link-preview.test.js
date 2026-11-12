import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseMetadata,publicURL,publicAddress,downloadPublic,resolveLinkPreview} from '../server/link-preview.mjs';
const origin='https://whisper.example';
test('Open Graph parser prefers OG, decodes entities and resolves image URLs without executing HTML',()=>{
 const data=parseMetadata('<title>Fallback</title><meta content="A &amp; B" property="og:title"><meta name="description" content="Plain"><meta property="og:description" content="  Short\n description "><meta property="og:image" content="/cover.png"><script>alert(1)</script>','https://example.com/a');
 assert.deepEqual(data,{title:'A & B',description:'Short description',image:'https://example.com/cover.png'});
 assert.equal(parseMetadata('<title>No image</title>','https://example.com').image,undefined);
 assert.equal(parseMetadata('<title>Fallback &amp; title</title>','https://example.com').title,'Fallback & title');
 assert.equal(parseMetadata('<meta name="twitter:title" content="Tweet">','https://example.com').title,'Tweet');
});
test('preview target checks reject local IPs, mapped addresses, reserved networks, credentials, private names and own links',()=>{
 for(const address of ['127.0.0.1','10.2.3.4','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['file:///etc/passwd','http://127.0.0.1','http://2130706433','http://[::ffff:127.0.0.1]','https://localhost','https://host.internal','https://user:pass@example.com','https://example.com:8080','https://whisper.example/s/one-time'])assert.throws(()=>publicURL(url,origin),undefined,url);
});
test('DNS validation rejects mixed public/private answers before any socket is opened',async()=>{
 await assert.rejects(downloadPublic('https://example.com',{origin,resolver:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]}),/Non-public/);
});
test('preview accepts only bounded raster image payloads and falls back to metadata without images',async()=>{
 const html=Buffer.from('<meta property="og:title" content="Test"><meta property="og:image" content="/image">');
 const loader=async(_url,options)=>options.kind==='image'?{type:'image/svg+xml',bytes:Buffer.from('<svg onload="alert(1)"/>')}:{bytes:html,url:'https://example.com/'};
 assert.deepEqual(await resolveLinkPreview('https://example.com',{origin,loader}),{title:'Test',description:''});
 const valid=await resolveLinkPreview('https://example.com',{origin,loader:async(url,options)=>options.kind==='image'?{type:'image/png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64')}:loader(url,options)});assert.equal(valid.image.type,'image/png');
});
