'use strict';

const {
  PRESENTATION_SCHEMA,
  failure,
  escapeHtml,
  computeDigest,
  fingerprint
} = require('./serePrimitives');
const { assertAuthoritativeSource } = require('./sereVerifier');

const TAG_REGEX = /\[(?:mandate|obs|evt|hyp|conf|ref|unk|act-auth|act-exec|diff|lim|dec|resp):[^\]]+\]/g;

function expectedDossierTags(dossier) {
  const tags = [
    `[mandate:${dossier.mandate.id}]`,
    ...dossier.observations.items.map((item) => `[obs:${item.id}]`),
    ...dossier.chronology.items.map((item) => `[evt:${item.id}]`),
    ...dossier.hypotheses.items.map((item) => `[hyp:${item.id}]`),
    ...dossier.hypotheses.confirmations.map((item) => `[conf:${item.id}]`),
    ...dossier.hypotheses.refutations.map((item) => `[ref:${item.id}]`),
    ...dossier.hypotheses.unknowns.map((item) => `[unk:${item.id}]`),
    ...dossier.actions.authorized.map((item) => `[act-auth:${item.id}]`),
    ...dossier.actions.executed.map((item) => `[act-exec:${item.id}]`),
    ...dossier.beforeAfter.items.map((item) => `[diff:${item.id}]`),
    ...dossier.visibilityLimitations.items.map((item) => `[lim:${item.id}]`),
    ...dossier.decisions.items.flatMap((item) => [`[dec:${item.id}]`, `[resp:${item.responsible.actorId}]`])
  ];
  return [...new Set(tags)].sort();
}

function renderMarkdownHeader(dossier, verification) {
  const m = dossier.mandate;
  return [
    `# Rapport de Preuves de Cybersécurité (SERE) — ${dossier.reportId}`,
    '',
    '> **AVERTISSEMENT D’AUTORITÉ** : Le PDF, le HTML ou le Markdown n’est que la présentation.',
    '> L’autorité réside exclusivement dans les données canoniques, les preuves et les vérificateurs.',
    `- **Dossier Hash** : \`${dossier.dossierHash}\``,
    `- **Verification Status** : \`${verification.status}\` (\`${verification.verificationHash}\`)`,
    `- **Vérificateur** : \`${verification.verifierId}\``,
    '',
    '## 1. Mandat et Périmètre',
    `- **Mandat** : \`[mandate:${m.id}]\` — ${m.title}`,
    `- **Émetteur** : ${m.issuer} (${m.issuedAt} → ${m.validUntil})`,
    `- **Cibles autorisées (in-scope)** : ${m.scope.inScopeTargets.join(', ')}`,
    `- **Cibles exclues (out-of-scope)** : ${m.scope.outOfScopeTargets.join(', ') || 'aucune'}`,
    `- **Règles d’engagement** : ${m.scope.rulesOfEngagement.join(', ') || 'standard'}`,
    `- **Empreinte du mandat** : \`${m.mandateHash}\``
  ].join('\n');
}

function renderMarkdownObservationsAndChronology(dossier) {
  const obsLines = ['## 2. Observations Classées par Source'];
  for (const group of dossier.observations.bySource) {
    obsLines.push(`### Source : \`${group.source}\` (${group.count}) — hash \`${group.sourceGroupHash}\``);
    for (const obs of group.observations) {
      obsLines.push(
        `- \`[obs:${obs.id}]\` [${obs.severity.toUpperCase()}] (${obs.observedAt}) cible=\`${obs.target}\` producteur=\`${obs.producerId}\` vérificateur=\`${obs.verifierId || 'n/a'}\` indépendant=\`${obs.independent}\` : ${obs.summary} (artefact=\`${obs.artifactRef}\`, sha256=\`${obs.artifactHash}\`)`
      );
    }
  }
  const chrLines = ['## 3. Événements Regroupés en Chronologie'];
  for (const bucket of dossier.chronology.buckets) {
    chrLines.push(`### Phase ${bucket.bucketIndex} : \`${bucket.phase}\` (${bucket.startedAt} → ${bucket.endedAt})`);
    for (const evt of bucket.events) {
      chrLines.push(
        `- \`[evt:${evt.id}]\` (#${evt.sequence}, ${evt.occurredAt}) \`${evt.kind}\` par \`${evt.actorId}\` : ${evt.summary} — preuves=[${evt.evidenceRefs.join(', ')}]`
      );
    }
  }
  return `${obsLines.join('\n')}\n\n${chrLines.join('\n')}`;
}

function renderMarkdownHypotheses(dossier) {
  const lines = ['## 4. Hypothèses, Confirmations, Réfutations et Inconnues'];
  for (const hyp of dossier.hypotheses.items) {
    lines.push(`### Hypothèse \`[hyp:${hyp.id}]\` — Statut : \`${hyp.status.toUpperCase()}\``);
    lines.push(`- **Énoncé** : ${hyp.statement} (proposé par \`${hyp.proposedBy}\`)`);
    for (const conf of hyp.confirmations) {
      lines.push(
        `  - Confirmation \`[conf:${conf.id}]\` via \`${conf.observationId}\` par \`${conf.verifierId}\` (indépendant=${conf.independent}) : ${conf.rationale} (\`${conf.evidenceHash}\`)`
      );
    }
    for (const ref of hyp.refutations) {
      lines.push(
        `  - Réfutation \`[ref:${ref.id}]\` via \`${ref.observationId}\` par \`${ref.verifierId}\` (indépendant=${ref.independent}) : ${ref.counterexample} (\`${ref.evidenceHash}\`)`
      );
    }
  }
  lines.push('### Inconnues Résiduelles');
  for (const unk of dossier.hypotheses.unknowns) {
    lines.push(
      `- \`[unk:${unk.id}]\` (${unk.area}, hypothèse=\`${unk.hypothesisId || 'globale'}\`) : ${unk.description} — Impact : ${unk.impact}`
    );
  }
  return lines.join('\n');
}

function renderMarkdownOperational(dossier) {
  const lines = ['## 5. Actions Autorisées et Réellement Exécutées'];
  for (const auth of dossier.actions.authorized) {
    lines.push(
      `- Autorisée \`[act-auth:${auth.id}]\` : type=\`${auth.actionType}\` cible=\`${auth.target}\` outil=\`${auth.commandOrTool}\` bail=\`${auth.leaseRef}\` par \`${auth.authorizedBy}\``
    );
  }
  for (const exec of dossier.actions.executed) {
    lines.push(
      `- Exécutée \`[act-exec:${exec.id}]\` (auth=\`${exec.authorizedActionId || 'none'}\`) : statut=\`${exec.status}\` cible=\`${exec.target}\` acteur=\`${exec.actorId}\` reçu=\`${exec.receiptRef}\` (\`${exec.receiptHash}\`)`
    );
  }
  lines.push('## 6. Différences Avant / Après');
  for (const diff of dossier.beforeAfter.items) {
    lines.push(
      `- \`[diff:${diff.id}]\` (${diff.category} sur \`${diff.target}\`, changé=\`${diff.delta.changed}\`) : avant=\`${diff.before.snapshotId}\` (\`${diff.before.digest}\`) → après=\`${diff.after.snapshotId}\` (\`${diff.after.digest}\`) — ${diff.delta.summary} (actions=[${diff.actionIds.join(', ')}], vérificateur=\`${diff.verifierId}\`)`
    );
  }
  lines.push('## 7. Limitations de Visibilité');
  for (const lim of dossier.visibilityLimitations.items) {
    lines.push(
      `- \`[lim:${lim.id}]\` [${lim.category}] portée=\`${lim.scope}\` : ${lim.description} (raison : ${lim.reason} ; impact : ${lim.impactOnConclusion})`
    );
  }
  lines.push('## 8. Décisions et Responsables');
  for (const dec of dossier.decisions.items) {
    lines.push(
      `- \`[dec:${dec.id}]\` **${dec.title}** — Disposition : \`${dec.disposition}\` — Responsable : \`[resp:${dec.responsible.actorId}]\` (${dec.responsible.name}, rôle=\`${dec.responsible.role}\`, autorité=\`${dec.responsible.authorityRef}\`) — Motif : ${dec.rationale} — Preuves : [${dec.evidenceRefs.join(', ')}]`
    );
  }
  return lines.join('\n');
}

function renderJuryMarkdown(dossier, verification) {
  assertAuthoritativeSource(dossier);
  return [
    renderMarkdownHeader(dossier, verification),
    renderMarkdownObservationsAndChronology(dossier),
    renderMarkdownHypotheses(dossier),
    renderMarkdownOperational(dossier)
  ].join('\n\n') + '\n';
}

function renderHtmlSections(dossier) {
  const tagsHtml = expectedDossierTags(dossier).map((tag) => `<code>${escapeHtml(tag)}</code>`).join(' ');
  const obsItems = dossier.observations.bySource.map((grp) => `<h3>Source: ${escapeHtml(grp.source)} (${grp.count})</h3><ul>` + grp.observations.map((o) => `<li><code>[obs:${escapeHtml(o.id)}]</code> <strong>${escapeHtml(o.target)}</strong>: ${escapeHtml(o.summary)} (<code>${escapeHtml(o.artifactHash)}</code>)</li>`).join('') + '</ul>').join('');
  const evtItems = dossier.chronology.buckets.map((b) => `<h3>Phase ${b.bucketIndex}: ${escapeHtml(b.phase)}</h3><ul>` + b.events.map((e) => `<li><code>[evt:${escapeHtml(e.id)}]</code> ${escapeHtml(e.occurredAt)} — ${escapeHtml(e.summary)}</li>`).join('') + '</ul>').join('');
  const hypItems = dossier.hypotheses.items.map((h) => `<li><code>[hyp:${escapeHtml(h.id)}]</code> [${escapeHtml(h.status)}] ${escapeHtml(h.statement)} ` + h.confirmations.map((c) => `<code>[conf:${escapeHtml(c.id)}]</code>`).join(' ') + ' ' + h.refutations.map((r) => `<code>[ref:${escapeHtml(r.id)}]</code>`).join(' ') + '</li>').join('');
  const unkItems = dossier.hypotheses.unknowns.map((u) => `<li><code>[unk:${escapeHtml(u.id)}]</code> (${escapeHtml(u.area)}): ${escapeHtml(u.description)}</li>`).join('');
  const actItems = dossier.actions.authorized.map((a) => `<li><code>[act-auth:${escapeHtml(a.id)}]</code> ${escapeHtml(a.actionType)} on ${escapeHtml(a.target)}</li>`).join('') + dossier.actions.executed.map((x) => `<li><code>[act-exec:${escapeHtml(x.id)}]</code> ${escapeHtml(x.status)} (${escapeHtml(x.receiptHash)})</li>`).join('');
  const diffItems = dossier.beforeAfter.items.map((d) => `<li><code>[diff:${escapeHtml(d.id)}]</code> ${escapeHtml(d.target)}: ${escapeHtml(d.before.digest)} → ${escapeHtml(d.after.digest)} (${escapeHtml(d.delta.summary)})</li>`).join('');
  const limItems = dossier.visibilityLimitations.items.map((l) => `<li><code>[lim:${escapeHtml(l.id)}]</code> ${escapeHtml(l.scope)}: ${escapeHtml(l.description)}</li>`).join('');
  const decItems = dossier.decisions.items.map((d) => `<li><code>[dec:${escapeHtml(d.id)}]</code> <strong>${escapeHtml(d.title)}</strong> (${escapeHtml(d.disposition)}) — Responsable: <code>[resp:${escapeHtml(d.responsible.actorId)}]</code> (${escapeHtml(d.responsible.name)}, ${escapeHtml(d.responsible.role)}) — ${escapeHtml(d.rationale)}</li>`).join('');
  return { tagsHtml, obsItems, evtItems, hypItems, unkItems, actItems, diffItems, limItems, decItems };
}

function renderJuryHtml(dossier, verification) {
  assertAuthoritativeSource(dossier);
  const s = renderHtmlSections(dossier);
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">',
    `<title>Rapport Jury SERE — ${escapeHtml(dossier.reportId)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;line-height:1.5}.banner{border:2px solid #b91c1c;background:#fef2f2;padding:1rem;margin-bottom:1.5rem}code{background:#f3f4f6;padding:0.1rem 0.3rem}</style>',
    '</head><body>',
    `<div class="banner" data-authority="none"><strong>AVERTISSEMENT D’AUTORITÉ :</strong> Le PDF ou le HTML n’est que la présentation. L’autorité réside exclusivement dans les données, les preuves et les vérificateurs. DossierHash: <code>${escapeHtml(dossier.dossierHash)}</code> | VerificationHash: <code>${escapeHtml(verification.verificationHash)}</code></div>`,
    `<h1>Rapport de Cybersécurité SERE — ${escapeHtml(dossier.reportId)}</h1>`,
    `<section id="mandate"><h2>1. Mandat et Périmètre</h2><p><code>[mandate:${escapeHtml(dossier.mandate.id)}]</code> ${escapeHtml(dossier.mandate.title)} — Émetteur: ${escapeHtml(dossier.mandate.issuer)}</p></section>`,
    `<section id="observations"><h2>2. Observations par Source</h2>${s.obsItems}</section>`,
    `<section id="chronology"><h2>3. Chronologie</h2>${s.evtItems}</section>`,
    `<section id="hypotheses"><h2>4. Hypothèses, Confirmations, Réfutations et Inconnues</h2><ul>${s.hypItems}</ul><h3>Inconnues</h3><ul>${s.unkItems}</ul></section>`,
    `<section id="actions"><h2>5. Actions Autorisées et Exécutées</h2><ul>${s.actItems}</ul></section>`,
    `<section id="before-after"><h2>6. Différences Avant / Après</h2><ul>${s.diffItems}</ul></section>`,
    `<section id="limitations"><h2>7. Limitations de Visibilité</h2><ul>${s.limItems}</ul></section>`,
    `<section id="decisions"><h2>8. Décisions et Responsables</h2><ul>${s.decItems}</ul></section>`,
    `<footer id="trace-index"><h2>Index de Traçabilité</h2><p>${s.tagsHtml}</p></footer>`,
    '</body></html>'
  ].join('\n');
}

function renderJuryDocument(dossier, verification) {
  assertAuthoritativeSource(dossier);
  if (!verification || verification.dossierHash !== dossier.dossierHash) {
    throw failure('SERE_VERIFICATION_BINDING_REQUIRED');
  }
  const markdown = renderJuryMarkdown(dossier, verification);
  const html = renderJuryHtml(dossier, verification);
  const body = {
    schema: PRESENTATION_SCHEMA,
    reportId: dossier.reportId,
    authority: 'none',
    isPresentationOnly: true,
    authorityNotice: 'PDF, HTML and Markdown are presentation only. Authority resides in the machine dossier, evidence and verifiers.',
    authoritativeDossierHash: dossier.dossierHash,
    authoritativeVerificationHash: verification.verificationHash,
    formats: ['markdown', 'html'],
    markdown,
    html,
    markdownDigest: computeDigest(markdown),
    htmlDigest: computeDigest(html)
  };
  return { ...body, presentationHash: fingerprint(body) };
}

function extractTags(content) {
  return [...new Set(String(content || '').match(TAG_REGEX) || [])].sort();
}

function checkPresentationHashes(presentation) {
  const copy = { ...presentation };
  delete copy.presentationHash;
  return [
    presentation.presentationHash === fingerprint(copy),
    presentation.markdownDigest === computeDigest(presentation.markdown),
    presentation.htmlDigest === computeDigest(presentation.html)
  ].every(Boolean);
}

function verifyJuryPresentation(dossier, presentation) {
  assertAuthoritativeSource(dossier);
  if (!presentation || presentation.schema !== PRESENTATION_SCHEMA) {
    throw failure('SERE_PRESENTATION_INVALID');
  }
  const expected = new Set(expectedDossierTags(dossier));
  const mdTags = new Set(extractTags(presentation.markdown));
  const htmlTags = new Set(extractTags(presentation.html));
  const uncoveredTags = [...expected].filter((tag) => !mdTags.has(tag) || !htmlTags.has(tag));
  const fabricatedTags = [...new Set([...mdTags, ...htmlTags])].filter((tag) => !expected.has(tag));
  const hashMatches = checkPresentationHashes(presentation);
  const authorityBoundaryOk = [
    presentation.authority === 'none',
    presentation.isPresentationOnly === true,
    presentation.authoritativeDossierHash === dossier.dossierHash
  ].every(Boolean);
  const ok = [hashMatches, authorityBoundaryOk, uncoveredTags.length === 0, fabricatedTags.length === 0].every(Boolean);
  return {
    ok,
    hashMatches,
    authorityBoundaryOk,
    uncoveredTags,
    fabricatedTags
  };
}

module.exports = {
  expectedDossierTags,
  renderJuryMarkdown,
  renderJuryHtml,
  renderJuryDocument,
  verifyJuryPresentation
};
