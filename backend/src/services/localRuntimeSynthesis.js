function parseReply(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '').replace(/^json\s*\n/i, '');
  try { return JSON.parse(source); } catch (_) { return {}; }
}

function validateSynthesisReply(text, plan) {
  if (!plan?.synthesisOnly || !plan.completedWorkerIds?.length) return;
  const influences = parseReply(text).dossierInfluence;
  if (!Array.isArray(influences)) throw new Error('dossierInfluence doit être un tableau JSON avec une entrée par workerId du dossier.');
  const missing = plan.completedWorkerIds.filter((id) => !influences.some((entry) => entry.workerId === id
    && typeof entry.influence === 'string' && entry.influence.trim() && Array.isArray(entry.usedClaims)
    && entry.usedClaims.every((claim) => typeof claim === 'string' && claim.trim())));
  if (missing.length) throw new Error(`dossierInfluence manque les workers: ${missing.join(', ')}`);
}

function reportClaims(parsedReply, reply, state) {
  if (state.mission.executionMode === 'worker' && Array.isArray(parsedReply.claims)) return parsedReply.claims;
  return [{ statement: reply, evidence: [state.selfIntro] }];
}

function attachInfluence(report, parsedReply) {
  if (Array.isArray(parsedReply.dossierInfluence)) report.dossierInfluence = parsedReply.dossierInfluence;
}

module.exports = { parseReply, validateSynthesisReply, reportClaims, attachInfluence };
