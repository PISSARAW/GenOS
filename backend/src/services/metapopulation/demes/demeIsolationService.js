'use strict';
function assertLocalWrite(demeId, boundary) {
  if (!demeId || !boundary || boundary.demeId !== demeId || boundary.scope !== 'local') {
    throw Object.assign(new Error('Write crosses the deme boundary.'), { code: 'METAPOPULATION_BOUNDARY_VIOLATION' });
  }
  return true;
}
module.exports = { assertLocalWrite };
