import {test} from 'node:test';import assert from 'node:assert/strict';
import {spoilerParts,spoilerSummary} from '../web/spoiler.js';
test('selected spoiler spans redact independently, including URLs and emoji tokens',()=>{
 const input='Hello ||secret https://private.example :pepe:|| and ||123456||!';
 assert.equal(spoilerSummary(input),'Hello [•••] and [•••]!');
 assert.deepEqual(spoilerParts(input).filter(p=>p.hidden).map(p=>p.text),['secret https://private.example :pepe:','123456']);
 assert.equal(spoilerSummary('plain | pipe ||unfinished'),'plain | pipe ||unfinished');
});
