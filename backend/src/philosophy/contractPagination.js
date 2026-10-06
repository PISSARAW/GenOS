'use strict';

const MAX_PAGE = 100;

function pageContracts(contracts, args = {}) {
  const offset = args.offset ?? 0;
  const limit = args.limit ?? MAX_PAGE;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('contract offset must be a non-negative integer');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE) throw new Error('contract page limit must be between 1 and 100');
  const selected = contracts.filter((contract) => !args.target || contract.targets.includes(args.target));
  const page = selected.slice(offset, offset + limit);
  const nextOffset = offset + page.length < selected.length ? offset + page.length : null;
  return { contracts: structuredClone(page), total: selected.length, offset, limit, nextOffset };
}

module.exports = { pageContracts, MAX_PAGE };
