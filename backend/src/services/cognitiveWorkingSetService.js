'use strict';

function createWorkingSet(input = {}) {
  const capacity = Number.isInteger(input.capacity) && input.capacity > 0 ? input.capacity : 8;
  const pages = new Map();
  function pageIn(page) {
    if (!page || typeof page.id !== 'string') return { status: 'blocked', reason: 'page_invalid' };
    if (!pages.has(page.id) && pages.size >= capacity) {
      const oldest = pages.keys().next().value;
      pages.delete(oldest);
    }
    pages.delete(page.id);
    pages.set(page.id, { ...page, loadedAt: Date.now() });
    return { status: 'ready', page: pages.get(page.id), workingSet: [...pages.keys()] };
  }
  function need(objectId) {
    return { status: pages.has(objectId) ? 'ready' : 'page_fault', objectId,
      page: pages.get(objectId) || null };
  }
  function pageOut(objectId) {
    const removed = pages.delete(objectId);
    return { status: removed ? 'ready' : 'deferred', objectId };
  }
  return { pageIn, need, pageOut, snapshot: () => [...pages.values()] };
}

module.exports = { createWorkingSet };
