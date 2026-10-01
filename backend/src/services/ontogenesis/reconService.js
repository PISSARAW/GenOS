'use strict';

const { recordMemory, listMemories } = require('./memoryService');
const { postEvent } = require('./inboxService');

/**
 * Recherche proactive en lecture seule (roadmap §P7).
 * Le producteur (daemon sentinelle, veille) observe et suggère ;
 * il ne peut ni écrire ni dispatcher. Toute proposition d'écriture
 * est rejetée ici, avant persistance. La trouvaille devient mémoire
 * (contrainte ou question) avec provenance read-only, plus un
 * événement wake pour le tick.
 */

const FINDING_KINDS = ['constraint', 'question'];

function checkFinding(input) {
  if (!input.source) throw new Error('source-requise');
  if (!input.topic) throw new Error('sujet-requis');
  if (!FINDING_KINDS.includes(input.kind)) throw new Error('finding-kind-inconnu');
  if (input.proposesWrite) throw new Error('ecriture-interdite');
}

function provenanceOf(input) {
  return { source: input.source, readOnly: true, links: input.links || [] };
}

async function submitFinding(db, input) {
  checkFinding(input);
  const id = await recordMemory(db, {
    projectId: input.projectId, kind: input.kind,
    content: `${input.topic}: ${input.detail || ''}`, provenance: provenanceOf(input)
  });
  await postEvent(db, { projectId: input.projectId, type: 'wake', payload: { origin: 'recon', memoryId: id } });
  return id;
}

function provenanceSource(row) {
  try {
    return (JSON.parse(row.provenance_json || '{}').source) || null;
  } catch (_) {
    return null;
  }
}

async function listReconFindings(db, input) {
  const rows = await listMemories(db, input.projectId, input.kind);
  return rows.filter((row) => provenanceSource(row) === input.source);
}

module.exports = { FINDING_KINDS, submitFinding, listReconFindings };
