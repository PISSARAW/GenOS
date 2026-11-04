'use strict';
const assert = require('node:assert/strict');
const {verifiedResult} = require('../src/services/orchestrationActionResult');
const context = {decision: {tool: 'genos_record_decision'}};
function reply(body) {return {success: true, output: [{type: 'text', text: JSON.stringify(body)}]};}
assert.equal(verifiedResult(context, {}, reply({success: true, persisted: true, decisionId: 'decision-real'})).success, true);
assert.equal(verifiedResult(context, {}, reply({success: false, persisted: true, decisionId: 'decision-failed'})).success, false);
assert.equal(verifiedResult(context, {}, reply({success: true, persisted: false, decisionId: 'decision-absent'})).success, false);
assert.equal(verifiedResult(context, {}, {success: true, output: [{type: 'text', text: 'success'}]}).success, false);
assert.equal(verifiedResult(context, {}, {success: true, output: [{type: 'text', text: '{}'}, {type: 'text', text: '{}'}]}).success, false);
console.log('Native MCP content blocks: actual typed decision proof accepted; domain failure, absent persistence and malformed content refused PASS');
