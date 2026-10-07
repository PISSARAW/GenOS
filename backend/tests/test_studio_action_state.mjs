import assert from 'node:assert/strict';
import { holdButtons, preserveFailure, uncertainEffect } from '../../integrations/studio/actionState.mjs';

const enabled = { disabled: false };
const disabled = { disabled: true };
const release = holdButtons({ querySelectorAll: () => [enabled, disabled] });
assert.equal(enabled.disabled, true);
assert.equal(disabled.disabled, true);
release();
assert.equal(enabled.disabled, false);
assert.equal(disabled.disabled, true);

for (const error of [{ kind: 'network' }, { kind: 'timeout' }, { status: 502 },
  { kind: 'protocol', status: 200 }, new TypeError('offline')]) {
  assert.equal(preserveFailure(error, { preserveView: true }), true);
}
for (const status of [403, 404, 409]) {
  assert.equal(preserveFailure({ status }, { preserveView: true }), false);
  assert.equal(preserveFailure({ status }, { preserveDraft: true }), true);
}
assert.equal(preserveFailure({ status: 401 }, { preserveDraft: true, preserveView: true }), false);
assert.equal(preserveFailure({ code: 'INVALID_APPROVAL_JSON' }, {}), true);
assert.equal(uncertainEffect({ outcome: 'unknown', retryable: false, kind: 'network' }), true);
assert.equal(uncertainEffect({ outcome: 'unknown', retryable: true, kind: 'network' }), false);
assert.equal(uncertainEffect({ outcome: 'unknown', kind: 'session' }), false);
console.log('Studio action state: original controls, transient reads, draft refusals and unknown mutation effects passed.');
