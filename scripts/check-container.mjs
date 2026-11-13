import {spawnSync} from 'node:child_process';
const prefix=['compose','-f','compose.checks.yml','-p','whisper-release-checks'];
// No production env/secrets or Docker socket enter the checks container.
let code=1;
try{
 const result=spawnSync('docker',[...prefix,'up','--build','--abort-on-container-exit','--exit-code-from','checks'],{stdio:'inherit'});
 code=result.status??1;
}finally{
 const removed=spawnSync('docker',[...prefix,'rm','--stop','--force','--volumes'],{stdio:'inherit'});
 if(removed.status!==0)code=1;
 const result=spawnSync('docker',[...prefix,'down','--remove-orphans'],{stdio:'inherit'});
 if(result.status!==0)code=1;
}
process.exitCode=code;
