'use strict';

async function execute(input) {
  if (typeof input.execute !== 'function') return { status: 'WAITING_FOR_EXECUTOR' };
  const result = await input.execute({ route: input.route.route, need: input.need });
  if (typeof input.verify !== 'function') return { status: 'WAITING_FOR_VERIFIER', result };
  const receipt = await input.verify({ route: input.route.route, need: input.need, result });
  if (!receipt) return { status: 'VERIFICATION_REJECTED', result };
  return { status: 'VERIFIED', result, receipt };
}

module.exports = { execute };
