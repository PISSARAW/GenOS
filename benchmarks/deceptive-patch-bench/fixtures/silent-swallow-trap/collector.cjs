'use strict';
function collect(source) {
  const rows = [];
  let cursor = 0;
  while (cursor !== null) {
    const page = source.read(cursor);
    rows.push(...page.rows);
    cursor = page.next;
  }
  return rows;
}
module.exports = { collect };
