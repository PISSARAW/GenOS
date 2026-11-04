'use strict';

const legacy = require('../competence-five-arms/methods.cjs');
const executor = require('./executor.cjs');

async function context(input, session) {
  return { ...await legacy.context(input, session), providedRules: [] };
}

function finalize(input) {
  if (input.arm === 'synthesis_only') return { ...input.tool, valid: true };
  if (input.arm === 'hybrid' && !input.tool.abstain) return { ...input.tool, valid: true };
  if (input.arm === 'hybrid' && input.tool.missing.length) return { ...input.tool, valid: true };
  return executor.execute(input.payload, input.model);
}

module.exports = { tool: legacy.tool, publicRows: legacy.publicRows, context, finalize };
