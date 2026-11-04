'use strict';
function source(pages, failures = []) {
  const remaining = new Set(failures);
  return { read(cursor) {
    if (remaining.delete(cursor)) throw Object.assign(Error('temporary'), { retryable: true });
    if (!pages[cursor]) throw Error('permanent');
    return { rows: [...pages[cursor]], next: cursor + 1 < pages.length ? cursor + 1 : null };
  } };
}
module.exports = { source };
