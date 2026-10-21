'use strict';

function paginate(items, pageNumber, pageSize) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new RangeError('pageSize must be positive');
  const start = (pageNumber - 1) * pageSize;
  return items.slice(start, start + pageSize - 1);
}

module.exports = { paginate };
