function parseReply(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '').replace(/^json\s*\n/i, '');
  try { return JSON.parse(source); } catch (_) { return {}; }
}

function validateSynthesisReply(text, plan) {
  if (!plan?.synthesisOnly || !plan.completedWorkerIds?.length) return;
  const { validateDossierInfluence } = require('./agentEvidenceService');
  const report = parseReply(text);
  const dossiers = plan.completedWorkerDossiers || [];
  try {
    validateDossierInfluence(report, plan.completedWorkerIds, { dossiers });
  } catch (error) {
    const exactClaims = dossiers.flatMap((dossier) => dossier.events.flatMap((event) =>
      (event.evidenceReport?.claims || []).map((claim) => claim.statement)));
    throw new Error(`${error.message} usedClaims doit contenir ces phrases exactes, sans balise ajoutée : ${JSON.stringify(exactClaims)}`);
  }
}

function validateWorkerReply(text, state) {
  if (state.mission.executionMode !== 'worker') return;
  const workerKinds = require('./agents/workerKindService');
  const { inspectWorkerArtifact } = require('./agents/workerArtifactContract');
  const kind = workerKinds.resolveWorkerKind(state.mission.workerKind, state.mission.role);
  const inspected = inspectWorkerArtifact(kind, text, { methodContract: state.mission.methodContract || null });
  if (inspected.artifact) return;
  throw new Error(`Artefact worker '${workerKinds.kindDefinition(kind).artifact}' invalide : ${inspected.issues.join(', ')}. Rends uniquement le JSON du contrat avec des claims sourcés.`);
}

function reportClaims(parsedReply, reply, state) {
  if (state.mission.executionMode === 'worker' && Array.isArray(parsedReply.claims)) return parsedReply.claims;
  return [{ statement: reply, evidence: [state.selfIntro] }];
}

function attachInfluence(report, parsedReply) {
  if (Array.isArray(parsedReply.dossierInfluence)) report.dossierInfluence = parsedReply.dossierInfluence;
}

module.exports = { parseReply, validateSynthesisReply, validateWorkerReply, reportClaims, attachInfluence };
