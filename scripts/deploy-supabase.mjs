// Management API applies migrations without exposing a database password to CI.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ref=process.env.SUPABASE_PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN;
if(!/^[a-z]{20}$/.test(ref||'')||!token)throw new Error('Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
async function query(sql){
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000),
 });
 if(!r.ok)throw new Error(`Supabase migration request failed (${r.status}); inspect the SQL migration locally. Response intentionally omitted.`);
 return r.json();
}
await query(`CREATE SCHEMA IF NOT EXISTS whisper_deploy;
 REVOKE ALL ON SCHEMA whisper_deploy FROM PUBLIC,anon,authenticated;
 CREATE TABLE IF NOT EXISTS whisper_deploy.migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
 REVOKE ALL ON ALL TABLES IN SCHEMA whisper_deploy FROM PUBLIC,anon,authenticated;`);
const files=(await readdir('supabase/migrations')).filter(f=>/^\d+_.*\.sql$/.test(f)).sort();
const versions=files.map(file=>file.split('_')[0]);if(new Set(versions).size!==versions.length)throw Error('Duplicate migration versions; fix before deployment');
for(const file of files){
 const sql=await readFile('supabase/migrations/'+file,'utf8'),version=file.split('_')[0],sha=createHash('sha256').update(sql).digest('hex');
 const rows=await query(`SELECT sha256 FROM whisper_deploy.migrations WHERE version=${quote(version)}`);
 if(rows.length){if(rows[0].sha256!==sha)throw new Error(`Applied migration changed: ${file}. Add a new migration instead.`);console.log(`Already applied: ${file}`);continue;}
 await query(`BEGIN; SELECT pg_advisory_xact_lock(83110642);
 DO $migration_guard$ BEGIN IF EXISTS (SELECT FROM whisper_deploy.migrations WHERE version=${quote(version)}) THEN RAISE EXCEPTION 'Concurrent migration; rerun deployment'; END IF; END $migration_guard$;
 ${sql}
 INSERT INTO whisper_deploy.migrations(version,sha256) VALUES (${quote(version)},${quote(sha)}); COMMIT;`);
 console.log(`Applied: ${file}`);
}
// Public URL only; the cron token is generated and retained inside database Vault.
const cleanupURL=`https://${ref}.supabase.co/functions/v1/whisper/storage-cleanup`;
await query(`DO $setup$ DECLARE existing uuid; BEGIN
 SELECT id INTO existing FROM vault.secrets WHERE name='whisper_storage_gc_url';
 IF existing IS NULL THEN PERFORM vault.create_secret(${quote(cleanupURL)},'whisper_storage_gc_url');
 ELSE PERFORM vault.update_secret(existing,${quote(cleanupURL)}); END IF; END $setup$;`);
const health=await query("SELECT jobname,active FROM cron.job WHERE jobname IN ('hush-expiry','whisper-housekeeping','whisper-room-expiry','whisper-storage-cleanup') ORDER BY jobname");
if(health.length!==4||health.some(j=>!j.active))throw new Error('Expiry jobs missing or inactive');
console.log('All expiry jobs are active.');
