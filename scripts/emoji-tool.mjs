// Launch the tool worker with a small filesystem allowlist and no inherited secrets.
import {spawn} from 'node:child_process';
import {emojiWorkerPermissions} from './emoji-tool-permissions.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=emojiWorkerPermissions(root);
// Native sharp needs addon permission. This is defense in depth for our fixed tool,
// not a security boundary against malicious native code or the same OS user.
const worker=spawn(process.execPath,[...args,path.join(root,'scripts/emoji-tool-server.mjs'),...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{LANG:'en_US.UTF-8',TZ:'UTC'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>worker.kill(signal));
worker.on('error',()=>{console.error('Could not start emoji tool worker');process.exitCode=1});
worker.on('exit',code=>{process.exitCode=code??1});
