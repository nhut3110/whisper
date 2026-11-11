import {mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
const ref=process.env.SUPABASE_PROJECT_REF;
if(!/^[a-z]{20}$/.test(ref||''))throw new Error('Set SUPABASE_PROJECT_REF to the dedicated Whisper project reference');
const out='.vercel/output';
await rm(out,{recursive:true,force:true});await mkdir(`${out}/static`,{recursive:true});
const files=['index.html','app.js','crypto.js','style.css','rich.js','theme.js','interactions.js','i18n.js','audio.js'];
for(const file of files)await copyFile(`web/${file}`,`${out}/static/${file}`);
await copyFile('web/vendor/purify.js',`${out}/static/purify.js`);
await copyFile('web/whisper-mark.svg',`${out}/static/favicon.svg`);
const upstream=`https://${ref}.supabase.co/functions/v1/whisper`;
const headers={
 'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(self), geolocation=()',
 'Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
};
await writeFile(`${out}/config.json`,JSON.stringify({version:3,routes:[
 {src:'/(.*)',headers,continue:true},
 {src:'/api/(.*)',dest:`${upstream}/$1`},
 {src:'/health',dest:`${upstream}/health`},
 {handle:'filesystem'},
 {src:'/m/[^/]+',dest:'/index.html'},
 {src:'/revoke/[^/]+',dest:'/index.html'},
]},null,2)+'\n');
// Only a fixed allowlist of public frontend files is ever copied, never env/DB/tests.
console.log(`Built ${files.length+2} public files for Whisper.`);
