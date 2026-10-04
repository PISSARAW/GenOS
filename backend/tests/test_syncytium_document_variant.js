'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createDocumentSession('Edit and undo document blocks and comments.');
  const sessionId = session.sessionId;
  await syncytium.insertDocumentBlock(sessionId, { opId: 'block-insert', actorId: 'writer',
    blockId: 'block-original', sectionId: 'summary', blockType: 'paragraph', text: 'Original' });
  const update = await syncytium.updateDocumentBlock(sessionId, { actorId: 'writer', blockId: 'block-original',
    replacementBlockId: 'block-updated', blockType: 'paragraph', text: 'Updated' });
  const afterUpdate = await syncytium.documentSnapshot(sessionId);
  assert.deepEqual(afterUpdate.shared.sharedFields.sections.map((block) => block.text), ['Updated']);
  const updateOps = (await syncytium.inspectHistory(sessionId)).operations.filter((operation) => operation.transactionId === update.txId);
  assert.equal(updateOps.length, 2);
  await syncytium.undoDocumentOperation(sessionId, { actorId: 'writer', operationId: updateOps[1].opId, undoId: 'undo-update' });
  assert.deepEqual((await syncytium.documentSnapshot(sessionId)).shared.sharedFields.sections.map((block) => block.text), ['Original']);

  const restoredBlockId = (await syncytium.documentSnapshot(sessionId)).shared.sharedFields.sections[0].blockId;
  await syncytium.addDocumentComment(sessionId, { opId: 'comment-add', actorId: 'reviewer', commentId: 'comment-1',
    blockId: restoredBlockId, text: 'Please clarify.' });
  await syncytium.retractDocumentComment(sessionId, { opId: 'comment-retract', actorId: 'reviewer', commentId: 'comment-1' });
  assert.equal((await syncytium.documentSnapshot(sessionId)).shared.sharedFields.activeComments.length, 0);
  await syncytium.undoDocumentOperation(sessionId, { actorId: 'reviewer', operationId: 'comment-retract', undoId: 'undo-retract' });
  assert.equal((await syncytium.documentSnapshot(sessionId)).shared.sharedFields.activeComments.length, 1);
  console.log('Syncytium document editing and compensation checks: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
