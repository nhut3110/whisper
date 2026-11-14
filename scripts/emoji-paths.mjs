import fs from 'node:fs/promises';
import path from 'node:path';
// Reject symlinks at every existing path component, including output directories.
export async function plainPath(root,relative,{file=false}={}){
 let current=root;
 if(!process.permission||process.permission.has('fs.read',root)){const base=await fs.lstat(root);if(base.isSymbolicLink()||!base.isDirectory())throw Error('Unsafe project root');root=await fs.realpath(root);current=root;}
 for(const part of relative.split('/')){
  if(!part||part==='.'||part==='..')throw Error('Unsafe local path');current=path.join(current,part);
  // The worker cannot read ancestor listings outside its allowlist. Check the
  // canonical path at the first readable child to detect ancestor symlinks too.
  if(process.permission&&!process.permission.has('fs.read',current))continue;
  let stat;try{stat=await fs.lstat(current)}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(await fs.realpath(current)!==current)throw Error('Symlink ancestors are not allowed');
  if(stat.isSymbolicLink()||(stat.isFile()&&stat.nlink!==1))throw Error('Symlinks and hardlinked files are not allowed');
  if(current!==path.join(root,...relative.split('/'))&&!stat.isDirectory())throw Error('Unsafe local path');
  if(file&&current===path.join(root,...relative.split('/'))&&!stat.isFile())throw Error('Expected a regular file');
 }
 return current;
}
