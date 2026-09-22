'use strict';

function buildCuriositySection(nce) {
  if (!nce.curiosity?.ranking?.length) return '';
  const top = nce.curiosity.ranking.slice(0, 3).map(d => d.domainId || d).filter(Boolean).join(', ');
  if (!top) return '';
  return `\n\n## Domaines a explorer (curiosite)\n${top}`;
}

function buildRepresentationsSection(nce) {
  if (!nce.representations?.length) return '';
  return `\n\n## Representations alternatives\n${nce.representations.slice(0, 3).map(r => `- ${r.description || r.name || JSON.stringify(r).slice(0, 100)}`).join('\n')}`;
}

function buildExaptationsSection(nce) {
  if (!nce.exaptations?.length) return '';
  return `\n\n## Exaptations\n${nce.exaptations.slice(0, 3).map(e => `- ${e.questions ? e.questions[0] : JSON.stringify(e).slice(0, 100)}`).join('\n')}`;
}

function buildCultureSection(nce) {
  if (!nce.culturalTraits?.length) return '';
  return `\n\n## Traits culturels\n${nce.culturalTraits.slice(0, 3).map(t => `- ${t.name || t.id || JSON.stringify(t).slice(0, 100)}`).join('\n')}`;
}

function buildNCEEnrichment(context) {
  if (!context.nceEnrichments) return '';
  const nce = context.nceEnrichments;
  return buildCuriositySection(nce) + buildRepresentationsSection(nce) + buildExaptationsSection(nce) + buildCultureSection(nce);
}

module.exports = { buildNCEEnrichment };
