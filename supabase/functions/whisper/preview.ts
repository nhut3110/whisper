export function previewHTML(shell: string, origin: string, handle: string, data: {burn: boolean; expires_at: number} | null | undefined): string {
 const title = data ? (data.burn ? 'Whisper. — Open once' : 'Whisper. — A private message') : data === null ? 'Whisper. — Link unavailable' : 'Whisper. — A private message';
 const expiry = data ? new Date(data.expires_at * 1000).toISOString().replace('T',' ').replace('.000Z',' UTC') : '';
 const description = data ? (data.burn ? 'Open once, then this link is gone. ' : 'Reopen until it expires. ') + 'Valid until ' + expiry + '. Encrypted content stays private.' : data === null ? 'This message has expired, was opened, or is no longer available.' : 'Open this encrypted message in Whisper.';
 const image = origin + '/og-' + (data === null ? 'gone' : data?.burn ? 'once' : 'timed') + '.png';
 // All interpolated values are fixed strings, validated configuration/handles, or an ISO timestamp.
 const esc = (s: string) => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll("'",'&#39;');
 const tags = [['name','description',description],['name','robots','noindex, noarchive, nosnippet'],['property','og:type','website'],['property','og:site_name','Whisper.'],['property','og:title',title],['property','og:description',description],['property','og:url',origin+'/s/'+handle],['property','og:image',image],['property','og:image:width','1200'],['property','og:image:height','630'],['property','og:image:alt',title],['name','twitter:card','summary_large_image'],['name','twitter:title',title],['name','twitter:description',description],['name','twitter:image',image]].map(([kind,key,value])=>`<meta ${kind}="${key}" content="${esc(value)}">`).join('');
 return shell.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>').replace('</head>',tags+'</head>');
}
