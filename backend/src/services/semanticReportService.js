'use strict';

/**
 * Rapport sémantique multi-rôle (sens avant surface).
 *
 * Cinq rôles extraient depuis les dossiers (sans LLM) : forensic (faits
 * causaux sourcés), verifier (frontières de confiance), historian
 * (chronologie), domain (sémantique par rôle), adversary (implications
 * dangereuses = contestés + échecs). Sortie SemanticReport + contrat de
 * rendu (le LLM verbalise, ne décide pas du contenu). Pur et déterministe.
 */

function dossierEvents(dossier) {
  return dossier && Array.isArray(dossier.events) ? dossier.events : [];
}

function dossierReports(dossier) {
  const reports = [];
  for (const event of dossierEvents(dossier)) {
    const report = event.evidenceReport || (event.payload && (event.payload.evidenceReport || event.payload.report));
    if (report && typeof report === 'object') reports.push(report);
  }
  return reports;
}

function dossierClaims(dossier) {
  const claims = [];
  for (const report of dossierReports(dossier)) {
    for (const claim of Array.isArray(report.claims) ? report.claims : []) {
      claims.push({ workerId: dossier.workerId || dossier.agentId || null, role: dossier.role || null, outcome: report.outcome || 'unknown', statement: claim.statement || '', evidence: Array.isArray(claim.evidence) ? claim.evidence : [] });
    }
  }
  return claims;
}

function citedTools(claim) {
  const text = `${claim.statement} ${claim.evidence.join(' ')}`;
  const tools = new Set();
  for (const token of text.split(/[^a-zA-Z0-9_]+/)) {
    if (token.startsWith('genos_')) tools.add(token);
  }
  return [...tools];
}

function buildSemanticReport(dossiers, options) {
  const settings = options || {};
  const list = Array.isArray(dossiers) ? dossiers : [];
  const claims = list.flatMap(dossierClaims);
  const propositions = claims.map((claim, index) => ({ id: `prop_${index + 1}`, workerId: claim.workerId, statement: claim.statement.slice(0, 200), outcome: claim.outcome }));
  const causalRelations = [];
  for (const proposition of propositions) {
    const tools = citedTools({ statement: proposition.statement, evidence: [] });
    for (const tool of tools) causalRelations.push({ claim: proposition.id, causedByTool: tool });
  }
  const chronology = list.map((dossier, index) => ({ workerId: dossier.workerId || dossier.agentId || `worker_${index}`, role: dossier.role || null, claims: dossierClaims(dossier).length }));
  const topN = Math.max(1, Math.min(20, Math.floor(Number(settings.topN) || 5)));
  const salience = [...propositions].sort((a, b) => (b.statement.length || 0) - (a.statement.length || 0)).slice(0, topN).map((proposition) => proposition.id);
  const uncertainties = propositions.filter((proposition) => proposition.outcome === 'no_answer' || proposition.outcome === 'unknown').map((proposition) => proposition.id);
  const failed = propositions.filter((proposition) => proposition.outcome === 'failed');
  const contradictions = [];
  for (let i = 0; i < propositions.length; i++) {
    for (let j = i + 1; j < propositions.length; j++) {
      const norm = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
      if (norm(propositions[i].statement) === norm(propositions[j].statement) && propositions[i].outcome !== propositions[j].outcome) {
        contradictions.push([propositions[i].id, propositions[j].id]);
      }
    }
  }
  const omissions = list
    .filter((dossier) => dossierClaims(dossier).length === 0)
    .map((dossier) => dossier.workerId || dossier.agentId || 'unknown');
  return { propositions, causalRelations, chronology, salience, uncertainties, contradictions, omissions, adversaryNotes: failed.map((proposition) => proposition.id) };
}

function renderingContract(report) {
  const source = report || {};
  return {
    rules: [
      'factual-needs-claim: every factual sentence cites at least one proposition id',
      'uncertainty-marked: uncertainties and omissions stay visible, never smoothed',
      'contradictions-shown: contested pairs are presented, never silently resolved',
      'no-new-facts: no tool, number or cause outside propositions and causalRelations'
    ],
    forbidden: ['invented_tools', 'resolved_contradictions', 'hidden_uncertainty'],
    propositions: (source.propositions || []).length,
    uncovered: (source.propositions || []).map((proposition) => proposition.id)
  };
}

module.exports = { buildSemanticReport, renderingContract };
