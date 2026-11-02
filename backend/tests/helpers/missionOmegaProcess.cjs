'use strict';

const fs = require('node:fs');
const { openDatabase } = require('./biologyDatabase');
const router = require('../../src/services/cognitiveOmegaRouterExecution');
const { OmegaEffectResource } = require('../../src/services/omegaProtocol/resource');

async function main() {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const db = openDatabase(input.database);
  if (process.argv[3] === 'crash-gap') {
    const execute = OmegaEffectResource.prototype.execute;
    OmegaEffectResource.prototype.execute = async function committedThenCrash(request) {
      const receipt = await execute.call(this, request);
      process.send({ effectCommitted: true, receipt });
      await new Promise(() => {});
    };
  }
  try {
    const output = await router.executeNativeGraph({ graph: input.graph, context: { ...input.context, db }, candidates: [], mode: 'fallback',
      options: { cognitiveNativeHandlers: { selectors: { value: ({ input: candidate }) => ({ value: candidate.value }) },
        verifiers: { seven: ({ candidate }) => ({ status: candidate.value === 7 ? 'verified' : 'refuted',
          valid: candidate.value === 7, predicate: 'value-equals-seven' }) } } } });
    process.send({ completed: true, output });
  } finally { await db.close(); }
}
main().catch(error => { process.send({ error: error.message }); process.exitCode = 1; });
