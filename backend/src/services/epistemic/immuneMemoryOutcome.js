'use strict';

const memory = require('./immuneMemoryService');
const repository = require('./immuneMemoryRepository');
const { extractAntigensFromReport } = require('./aeisPromotionBridge');

async function persistEvaluatedMemory(db, input) {
  const antigens = extractAntigensFromReport(input.report, input.domain);
  await repository.save(db, input.immuneMemory, input.scopeId);
  for (let index = 0; index < antigens.length; index += 1) {
    const formal = input.evaluation.assembly?.results[index];
    if (!formal) continue;
    await repository.resolve(db, {
      scopeId: input.scopeId, signature: memory.signatureFrom(antigens[index]),
      assemblyId: input.evaluation.persistedAssemblyId, runId: input.runId,
      resultId: formal.resultId, test: antigens[index].verificationContract.test,
    });
  }
}

module.exports = { persistEvaluatedMemory };
