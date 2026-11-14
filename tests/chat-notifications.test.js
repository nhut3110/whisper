import {test} from 'node:test';import assert from 'node:assert/strict';
import {incomingAfter} from '../frontend/chat/notifications.ts';
test('notifications ignore history, self messages and optimistic drafts',()=>{
 const messages=[{seq:1,sender:'guest'},{seq:2,sender:'me'},{seq:-1,sender:'guest',pending:true},{seq:3,sender:'guest'},{seq:4,sender:'guest',pending:true}];
 assert.deepEqual(incomingAfter(messages,1,'me'),[{seq:3,sender:'guest'}]);
 assert.deepEqual(incomingAfter(messages,4,'me'),[]);
});
test('notification detection tolerates rolling-history gaps and deleted messages',()=>{
 assert.deepEqual(incomingAfter([{seq:38,sender:'guest'},{seq:42,sender:'guest'}],40,'me'),[{seq:42,sender:'guest'}]);
});
