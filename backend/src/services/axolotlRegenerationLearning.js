'use strict';
const { error, hash } = require('./axolotlStateStore');

function createLearningRecord(input = {}) {
  const items = input.candidates || [];
  if (!Array.isArray(items) || items.length > 128) throw error('AXOLOTL_CANDIDATES_INVALID');
  const candidates = items.map(normalizeCandidate);
  if (new Set(candidates.map((item) => item.id)).size !== candidates.length) throw error('AXOLOTL_CANDIDATE_ID_DUPLICATED');
  return { status: candidates.length ? 'proposed' : 'not_requested', candidates, experiments: [] };
}
function normalizeCandidate(candidate, index) {
  validateCandidate(candidate);
  const id = String(candidate.id || `candidate_${index + 1}`);
  if (!/^[\w.-]{1,160}$/.test(id)) throw error('AXOLOTL_CANDIDATE_ID_INVALID');
  return { id, key: candidate.key, kind: candidate.kind || 'knowledge', content: structuredClone(candidate.content),
    contentHash: hash(candidate.content), sourceRefs: structuredClone(candidate.sourceRefs || []),
    status: 'proposed', evidence: [] };
}
function validateCandidate(candidate) {
  if (!candidate || typeof candidate.key !== 'string' || !candidate.key.trim() || candidate.key.length > 160) throw error('AXOLOTL_CANDIDATE_KEY_REQUIRED');
  if (!Object.hasOwn(candidate, 'content') || candidate.content === undefined || Buffer.byteLength(JSON.stringify(candidate.content)) > 65536) throw error('AXOLOTL_CANDIDATE_CONTENT_INVALID');
  if (candidate.sourceRefs && !Array.isArray(candidate.sourceRefs)) throw error('AXOLOTL_CANDIDATE_SOURCES_INVALID');
}
function scopedCandidates(session, input) {
  const record = createLearningRecord(input);
  const scope = new Set(session.cognitiveScope || []);
  if (record.candidates.some((item) => !scope.has(item.key))) throw error('AXOLOTL_COGNITIVE_SCOPE_DENIED');
  if (record.candidates.some((item) => !session.functionalContract.probes.some((probe) => probe.kind === 'recall' && probe.key === item.key))) throw error('AXOLOTL_CANDIDATE_NOT_COVERED');
  if (record.candidates.length + 2 > session.budget.experiments) throw error('AXOLOTL_EXPERIMENT_BUDGET_EXHAUSTED');
  return record;
}
module.exports = { createLearningRecord, scopedCandidates };
