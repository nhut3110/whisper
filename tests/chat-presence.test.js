import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCaptureShortcut} from '../frontend/chat/presence.ts';
test('capture hints recognize only supported shortcut patterns and ignore repeats',()=>{
 const base={key:'a',code:'KeyA',metaKey:false,shiftKey:false,repeat:false};
 for(const change of [{key:'PrintScreen'},{code:'PrintScreen'},{key:'#',code:'Digit3',metaKey:true,shiftKey:true},{key:'S',code:'KeyS',metaKey:true,shiftKey:true}])assert.equal(isCaptureShortcut({...base,...change}),true);
 for(const change of [{},{key:'3',code:'Digit3'},{key:'s',code:'KeyS',metaKey:true},{key:'PrintScreen',repeat:true},{key:'F12',code:'F12'}])assert.equal(isCaptureShortcut({...base,...change}),false);
});
