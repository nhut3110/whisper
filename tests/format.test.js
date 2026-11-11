import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatted} from '../web/format.js';
test('automatic formatting recognizes common Markdown and semantic HTML without treating code-looking plain text as HTML',()=>{
 for(const value of ['# Heading','Title\n===','**bold**','_italic_','- first\n- second','```js\nlet x=1;\n```','[guide](https://example.com)','| Fish | Count |\n| --- | --- |','<h2>Heading</h2>','<p><strong>Hello</strong></p>'])assert.equal(formatted(value),true,value);
 for(const value of ['Hello, ocean.','2 * 3 = 6','<script>alert(1)</script>','<img src=x>','<p>'.repeat(60000)])assert.equal(formatted(value),false,value.slice(0,60));
});
