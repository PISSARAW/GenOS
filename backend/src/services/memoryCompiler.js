const { textToVector } = require('./memoryScoring.js');
const vectorMemory = require('./vectorMemoryService.js');

function extractClaims(options) {
  const rawClaims = Array.isArray(options.claims) ? options.claims : (Array.isArray(options.evidenceReport?.claims) ? options.evidenceReport.claims : []);
  const unverifiedClaims = Array.isArray(options.unverifiedClaims) ? options.unverifiedClaims : (Array.isArray(options.evidenceReport?.unverifiedClaims) ? options.evidenceReport.unverifiedClaims : []);
  return { rawClaims, unverifiedClaims };
}

function hasUnprovenClaims({ rawClaims, unverifiedClaims, evidencePresent }) {
  return unverifiedClaims.length > 0 || rawClaims.some(c => !c || !evidencePresent(c.evidence || c.receipts || c.sourceRefs));
}

function buildContent({ verificationTag, task, summary, claimsText }) {
  return `${verificationTag} Task: ${task}\nResult: ${summary.slice(0, 800)}${claimsText}`;
}

async function recordProvenanceIfNeeded({ memId, options, rawClaims, summary }) {
  if (!options.provenanceHash || !memId) return;
  try {
    const { recordProvenance } = require('./evaluationObservabilityService.js');
    await recordProvenance('decision', memId, { decisionId: memId, agentId: options.agentId || 'agent', task: options.task || '', summary: summary.slice(0, 500), claims: rawClaims }, options.provenanceHash, { organizationId: options.organizationId, projectId: options.projectId });
  } catch (_) {}
}

async function depositExosomeIfNeeded(params) {
  const { isFailure, hasUnprovenClaims, agentId, task, summary, options } = params;
  if (isFailure || hasUnprovenClaims) return;
  try {
    const engramContent = `Agent ${agentId} learned from task "${task.slice(0, 100)}": ${summary.slice(0, 400)}`;
    await vectorMemory.depositExosome({
      new_engrams: [{ content: engramContent, vector: textToVector(engramContent) }],
      plasmid_name: `plasmid_${agentId}_${Date.now()}`,
      plasmid_code: `// Epigenetic transmission from ${agentId}\n// Task: ${task.slice(0, 80)}\n// Insight: ${summary.slice(0, 200)}`,
      organizationId: options.organizationId, projectId: options.projectId
    });
  } catch {}
}

async function compileExecutionMemory({ agentId = 'agent', task = '', summary = '', options = {} }) {
  if (!summary) return null;
  try {
    const isFailure = Boolean(options.isFailure || options.status === 'failed' || options.outcome === 'failed');
    const epistemics = require('./epistemics.js');
    const perception = epistemics.validateMemoryPerception({ summary, title: task });
    if (perception.isInvalid()) return null;
    const { evidencePresent } = require('./hallucinationMonitoringService.js');
    const { rawClaims, unverifiedClaims } = extractClaims(options);
    const claimsText = buildClaimsText(rawClaims);
    const verificationTag = isFailure ? '[FAILED]' : '[OK]';
    const content = buildContent({ verificationTag, task, summary, claimsText });
    const hasUnproven = hasUnprovenClaims({ rawClaims, unverifiedClaims, evidencePresent });
    const memId = require('crypto').randomUUID();
    await recordProvenanceIfNeeded({ memId, options, rawClaims, summary });
    await depositExosomeIfNeeded({ isFailure, hasUnprovenClaims: hasUnproven, agentId, task, summary, options });
    return { memId, content, isFailure, hasUnprovenClaims: hasUnproven };
  } catch (_) {
    return null;
  }
}

function buildClaimsText(rawClaims) {
  return rawClaims.length > 0 ? `\nClaims: ` + rawClaims.map(c => `[${c.statement} | evidence: ${Array.isArray(c.evidence) ? c.evidence.join(', ') : 'verified'}]`).join('; ') : '';
}

module.exports = { compileExecutionMemory, extractClaims, hasUnprovenClaims };