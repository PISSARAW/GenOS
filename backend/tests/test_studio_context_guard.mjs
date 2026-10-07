import assert from 'node:assert/strict';
import { requestContextChange, installDraftGuard } from '../../integrations/studio/contextGuard.mjs';

const target = new EventTarget();
let dirty = false;
let accepted = false;
let prompts = 0;
const dispose = installDraftGuard({ target, dirty: () => dirty, confirm: () => { prompts += 1; return accepted; } });
assert.equal(requestContextChange('scope', target), true);
assert.equal(prompts, 0);
dirty = true;
for (const reason of ['workspace', 'scope', 'connect', 'disconnect']) {
  assert.equal(requestContextChange(reason, target), false);
}
assert.equal(prompts, 4);
const unload = new Event('beforeunload', { cancelable: true });
assert.equal(target.dispatchEvent(unload), false);
assert.equal(unload.defaultPrevented, true);
accepted = true;
assert.equal(requestContextChange('scope', target), true);
dispose();
assert.equal(requestContextChange('scope', target), true);
assert.equal(target.dispatchEvent(new Event('beforeunload', { cancelable: true })), true);
console.log('Studio context guard: clean context, cancelled transitions, accepted discard and unload warning passed.');
