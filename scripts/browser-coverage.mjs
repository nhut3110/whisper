import fs from 'node:fs/promises';
import v8ToIstanbul from 'v8-to-istanbul';
import coverage from 'istanbul-lib-coverage';
const map=coverage.createCoverageMap({});
for(const file of await fs.readdir('coverage/browser-raw')){
 for(const entry of JSON.parse(await fs.readFile('coverage/browser-raw/'+file,'utf8'))){
  const name=new URL(entry.url).pathname;
  if(!['/app.js','/format.js','/crypto.js','/rich.js','/theme.js','/interactions.js','/i18n.js','/audio.js'].includes(name))continue;
  // Never merge executions of older source versions into current coverage.
  if(entry.source!==await fs.readFile('web'+name,'utf8'))continue;
  const converter=v8ToIstanbul('web'+name,0,{source:entry.source});await converter.load();converter.applyCoverage(entry.functions);map.merge(converter.toIstanbul());
 }
}
const result={};for(const file of map.files()){const s=map.fileCoverageFor(file).toSummary().toJSON();result[file.split('/').slice(-2).join('/')]=s;console.log(file.split('/').pop(),`lines ${s.lines.pct}% | branches ${s.branches.pct}% | functions ${s.functions.pct}%`);}
await fs.writeFile('coverage/browser-summary.json',JSON.stringify(result,null,2));
