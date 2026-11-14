import path from 'node:path';
import fs from 'node:fs';
export function emojiWorkerPermissions(root){
const read=['scripts','node_modules','package.json','shared','public/emoji-packs','supabase/migrations','emoji-import-local'];
const write=['public/emoji-packs','shared/emoji-packs.json','shared/.emoji-packs.lock','shared/.emoji-packs.pending','supabase/migrations','emoji-import-local'];
const args=['--permission','--allow-addons',...read.map(p=>'--allow-fs-read='+path.join(root,p)),...write.map(p=>'--allow-fs-write='+path.join(root,p))];
// Resolve dependency symlinks (e.g. an isolated test checkout), never a caller path.
args.push('--allow-fs-read='+fs.realpathSync(path.join(root,'node_modules')));
return args;
}
