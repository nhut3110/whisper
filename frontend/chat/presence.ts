// Browsers cannot confirm OS screenshots; these are only observable keyboard hints.
export function isCaptureShortcut(event:Pick<KeyboardEvent,'key'|'code'|'metaKey'|'shiftKey'|'repeat'>){
 if(event.repeat)return false;
 return event.key==='PrintScreen'||event.code==='PrintScreen'||
  event.metaKey&&event.shiftKey&&(['Digit3','Digit4','Digit5','KeyS'].includes(event.code)||['3','4','5','s'].includes(event.key.toLowerCase()));
}
