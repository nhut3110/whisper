import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewHTML} from '../supabase/functions/whisper/preview.ts';
const shell='<html><head><title>Whisper.</title></head><body>APP</body></html>';
test('preview HTML exposes read policy and UTC expiry, with no capability or content',()=>{
 const once=previewHTML(shell,'https://example.com','abcdefghijklmnop',{burn:true,expires_at:1794409200});
 assert.match(once,/Open once/);assert.match(once,/2026-11-11 15:00:00 UTC/);assert.match(once,/og-once\.png/);assert.match(once,/summary_large_image/);assert.match(once,/noindex, noarchive, nosnippet/);
 const timed=previewHTML(shell,'https://example.com','abcdefghijklmnop',{burn:false,expires_at:1794409200});assert.match(timed,/Reopen until/);assert.match(timed,/og-timed\.png/);
 const gone=previewHTML(shell,'https://example.com','abcdefghijklmnop',null);assert.match(gone,/Link unavailable/);assert.match(gone,/og-gone\.png/);
 const outage=previewHTML(shell,'https://example.com','abcdefghijklmnop',undefined);assert.match(outage,/Open this encrypted message/);assert.doesNotMatch(outage,/Link unavailable/);
});
test('metadata attributes are escaped and the app shell is preserved',()=>{
 const html=previewHTML(shell,'https://example.com/"<>&\'','"<>&\'',null);assert.ok(html.includes('&quot;&lt;&gt;&amp;&#39;'));assert.ok(html.endsWith('<body>APP</body></html>'));assert.ok(!html.includes('content="https://example.com/"'));
});

import {shareHandler} from '../server/share.mjs';
test('Vercel adapter makes a bounded public metadata request and serves real HTML, including HEAD',async()=>{
 const requests=[],config={origin:'https://example.com',api:'https://api.example.com'};
 const run=async(method='GET',handle='abcdefghijklmnop',response=new Response(JSON.stringify({burn:true,expires_at:1794409200,ignored:'SECRET'})))=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
  await shareHandler(config,shell,async(url,options)=>{requests.push({url,options});return response;})({url:'/share?handle='+encodeURIComponent(handle),method},res);return res;
 };
 const res=await run();assert.match(res.headers['Content-Type'],/text\/html/);assert.match(res.body,/og-once/);assert.ok(!res.body.includes('SECRET'));assert.equal(requests[0].url,'https://api.example.com/preview/abcdefghijklmnop');assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.headers,undefined);
 assert.equal((await run('HEAD')).body,undefined);assert.equal((await run('POST')).statusCode,404);assert.equal((await run('GET','bad')).statusCode,404);
 assert.match((await run('GET','abcdefghijklmnop',new Response('{}',{status:410}))).body,/og-gone/);
 assert.match((await run('GET','abcdefghijklmnop',new Response('{}',{status:503}))).body,/Open this encrypted message/);
 assert.match((await run('GET','abcdefghijklmnop',new Response('{}'))).body,/Open this encrypted message/);
 const failure={setHeader(){},end(body){this.body=body;}};await shareHandler(config,shell,async()=>{throw Error('offline');})({url:'/share?handle=abcdefghijklmnop',method:'GET'},failure);assert.match(failure.body,/Open this encrypted message/);
});
