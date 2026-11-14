import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEmojiTools,emojiToolDefinitions} from './emoji-tools.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tools=createEmojiTools(root);
const cli=process.argv.slice(2);
if(cli.length){
 try{if(cli.length!==2)throw Error('Usage: emoji-tool.mjs <tool_name> <JSON arguments>');console.log(JSON.stringify(await tools.call(cli[0],JSON.parse(cli[1])),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}else{
 // MCP stdio: newline-delimited JSON-RPC. No network listener or HTTP upload route.
 const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
 async function handle(message){
  const {id,method,params}=message||{};if(id===undefined)return;
  const result=value=>send({jsonrpc:'2.0',id,result:value});
  if(message.jsonrpc!=='2.0'||!['string','number'].includes(typeof id))return send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}});
  if(method==='initialize')return result({protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(params?.protocolVersion)?params.protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'whisper-emoji',version:'1.0.0'}});
  if(method==='ping')return result({});
  if(method==='tools/list')return result({tools:emojiToolDefinitions});
  if(method==='tools/call'){
   try{return result({content:[{type:'text',text:JSON.stringify(await tools.call(params?.name,params?.arguments),null,2)}]});}catch(e){return result({isError:true,content:[{type:'text',text:e.message}]});}
  }
  send({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
 }
 let buffer='',queue=Promise.resolve(),pending=0;
 process.stdin.setEncoding('utf8');
 process.stdin.on('data',chunk=>{
  buffer+=chunk;
  if(Buffer.byteLength(buffer)>65536){console.error('MCP request exceeds 64 KB');process.exit(1);}
  for(let end;(end=buffer.indexOf('\n'))>=0;){
   const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
   if(++pending>32){console.error('Too many pending MCP requests');process.exit(1);}
   queue=queue.then(async()=>{try{let message;try{message=JSON.parse(line)}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}await handle(message);}finally{pending--;}}).catch(()=>{console.error('MCP request failed')});
  }
 });
 process.stdin.on('end',()=>{void queue.then(()=>{if(buffer.trim())console.error('Incomplete MCP request')})});
}
