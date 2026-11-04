'use strict';
const c = require('./common.cjs');
function statistics(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return { count: 0, mean: null, median: null, total: null };
  const middle = Math.floor(valid.length / 2);
  return { count: valid.length, total: valid.reduce((a, b) => a + b, 0),
    mean: valid.reduce((a, b) => a + b, 0) / valid.length,
    median: valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2 };
}
function armSummary(rows, planned) {
  return { planned, completed: rows.length, missionsPassed: rows.filter(r => r.quality.allPassed).length,
    assertionsPassed: rows.reduce((sum, r) => sum + r.quality.passed, 0), assertionsPlanned: planned * 12,
    budgetViolations: rows.filter(r => !r.budgetValid).length,
    inputTokens: statistics(rows.map(r => r.usage?.inputTokens)),
    outputTokens: statistics(rows.map(r => r.usage?.outputTokens)),
    totalTokens: statistics(rows.map(r => r.usage?.totalTokens)),
    generationMs: statistics(rows.map(r => r.generationMs)),
    endToEndMs: statistics(rows.map(r => r.endToEndMs)), financialTotalUsd: null };
}
function pairedRows(manifest, results) {
  return [...new Set(manifest.runs.map(r => r.pairId))].map(pairId => {
    const rows = results.filter(r => r.pairId === pairId);
    const a = rows.find(r => r.arm === 'baseline'), b = rows.find(r => r.arm === 'temperature020');
    return { pairId, complete: rows.length === 2,
      baselinePassed: a?.quality.allPassed ?? false, variantPassed: b?.quality.allPassed ?? false,
      deltaTokens: a?.usage && b?.usage ? b.usage.totalTokens - a.usage.totalTokens : null,
      deltaEndToEndMs: a && b ? b.endToEndMs - a.endToEndMs : null };
  });
}
function textReport(summary) {
  const lines = ['# Comparaison exploratoire LocalCodeWorker', '',
    'Trois missions JavaScript, trois répétitions appariées par mission. Modèle réel local qwen2.5-coder:7b. Aucun candidat promu.', '',
    '**Périmètre :** expression des ADN réels, inférence Ollama et exécuteur de patches GenOS. La mission autonome complète a été refusée (REQUIRED_PHASES_UNAVAILABLE). Aucun reçu signé de mission complète ni qualification de production.', '',
    '| Mesure | Température 0,45 | Température 0,2 |', '|---|---:|---:|'];
  const a = summary.arms.baseline, b = summary.arms.temperature020;
  lines.push(`| Missions entièrement réussies | ${a.missionsPassed}/${a.planned} | ${b.missionsPassed}/${b.planned} |`,
    `| Assertions réussies | ${a.assertionsPassed}/${a.assertionsPlanned} | ${b.assertionsPassed}/${b.assertionsPlanned} |`,
    `| Tokens totaux mesurés | ${a.totalTokens.total} | ${b.totalTokens.total} |`,
    `| Latence médiane de bout en bout (ms) | ${a.endToEndMs.median?.toFixed(1)} | ${b.endToEndMs.median?.toFixed(1)} |`,
    `| Budgets dépassés / inconnus | ${a.budgetViolations} | ${b.budgetViolations} |`,
    '| Coût financier | inconnu | inconnu |', '',
    'Budget identique : 8 192 tokens observés au total, 1 536 tokens générés maximum, contexte 8 192 et 120 secondes par tentative. Une tentative par exécution ; les échecs restent dans le dénominateur.', '',
    'Le coût financier et électrique local ne sont pas instrumentés. Les tokens et durées fournisseur sont conservés. Le préchauffage est archivé séparément et exclu.', '',
    '| Paire | Réussite 0,45 | Réussite 0,2 | Δ tokens (0,2 − 0,45) | Δ latence (ms) |', '|---|---:|---:|---:|---:|');
  for (const p of summary.pairs) lines.push(`| ${p.pairId} | ${p.baselinePassed} | ${p.variantPassed} | ${p.deltaTokens} | ${p.deltaEndToEndMs?.toFixed(1)} |`);
  lines.push('', 'Ce petit corpus connu ne permet pas de conclure à une supériorité générale. Les répétitions partagent les mêmes missions. La latence dépend aussi du cache et de la charge locale ; l’ordre A/B alterne entre les paires.', '',
    'Preuves : manifest.json, genomes/, runs/*/{request,response,executor,oracle,result}.json, résultats agrégés dans summary.json. La vérification indépendante est conservée sous verifications/.', '');
  return lines.join('\n');
}
function report(archive) {
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  const data = c.read(c.path.join(archive, 'results.json'));
  const arms = Object.fromEntries(Object.keys(manifest.genomes).map(arm => [arm,
    armSummary(data.results.filter(r => r.arm === arm), manifest.runs.filter(r => r.arm === arm).length)]));
  const summary = { manifestHash: manifest.manifestHash, promotionAllowed: false,
    planned: data.planned, completed: data.completed, fullAutonomousMission: false,
    arms, pairs: pairedRows(manifest, data.results) };
  c.write(c.path.join(archive, 'summary.json'), summary);
  c.fs.writeFileSync(c.path.join(archive, 'rapport.md'), textReport(summary), { flag: 'wx' });
  console.log(JSON.stringify(summary));
  return summary;
}
module.exports = { report, statistics, armSummary, pairedRows };
