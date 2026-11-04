'use strict';
const c = require('./common.cjs');
function report(archive) {
  const data = c.read(c.path.join(archive, 'results.json'));
  const a = data.summary.baseline, b = data.summary.temperature020;
  const lines = ['# LocalCodeWorker : comparaison du chemin natif', '',
    'Date : 2026-11-04. Modèle réel local qwen2.5-coder:7b. ADN Hachimoji DRAFT aux températures 0,45 et 0,2. Aucun génome promu.', '',
    'Même corpus que le premier pilote : remise, pagination, validation de port ; répétitions appariées et graines inchangées. Le chemin natif ajoute ses instructions et contrôles. Les prompts effectivement envoyés sont archivés.', '',
    '| Mesure | 0,45 | 0,2 |', '|---|---:|---:|',
    `| Tentatives archivées | ${a.recorded}/9 | ${b.recorded}/9 |`,
    `| Réparations passant les 12 assertions dans le budget | ${a.candidatePasses}/9 | ${b.candidatePasses}/9 |`,
    `| Assertions candidates réussies | ${a.assertionsPassed}/108 | ${b.assertionsPassed}/108 |`,
    `| Reçus natifs vérifiés | ${a.nativeCompleted}/9 | ${b.nativeCompleted}/9 |`,
    `| Tentatives comparables dans le budget | ${a.comparable}/9 | ${b.comparable}/9 |`,
    `| Tokens totaux observés | ${a.tokens.total} | ${b.tokens.total} |`,
    `| Génération médiane, ms | ${a.generationMs.median} | ${b.generationMs.median} |`,
    `| Durée totale médiane, ms | ${a.wallMs.median} | ${b.wallMs.median} |`,
    '| Coût financier local | inconnu | inconnu |', '',
    'Budget : 8192 tokens totaux, 1536 tokens de sortie maximum, contexte 8192, 120 secondes et une seule génération par tentative. Préchauffage et prétests de préparation exclus, mais conservés. Tous les échecs restent dans les dénominateurs.', '',
    'Périmètre : préparation native du worker, sélection de son ADN dans un catalogue expérimental privé, budget partagé, autorité signée, modelRouter, exécuteur et contrôles de preuve. La sélection active dans la base isolée ne change pas le statut DRAFT des fichiers ADN. Aucun changement du catalogue de production.', '',
    'Le contrôleur autonome de la première relance a été refusé (graphe de vérité absent). Le contrôleur de ce banc est un programme local ; il ne remplace pas la preuve du worker. Une réparation passant les tests externes ne vaut pas qualification native : les deux résultats sont séparés ci-dessus.', '',
    '| Paire | Assertions 0,45 | Assertions 0,2 | Statut natif 0,45 | Statut natif 0,2 |', '|---|---:|---:|---|---|'];
  for (const pairId of new Set(data.rows.map(r => r.pairId))) {
    const left = data.rows.find(r => r.pairId === pairId && r.arm === 'baseline');
    const right = data.rows.find(r => r.pairId === pairId && r.arm === 'temperature020');
    lines.push(`| ${pairId} | ${left?.assertionsPassed} | ${right?.assertionsPassed} | ${left?.nativeStatus} | ${right?.nativeStatus} |`);
  }
  lines.push('', 'Les modèles locaux peuvent proposer un patch invalide ou une preuve non supportée. Ces refus sont conservés. Les erreurs de préparation et les prétests sont sous archive/setup-native-*, distincts de cette campagne. Le corpus connu et répété reste exploratoire ; aucune supériorité générale ne peut en être déduite.', '',
    'Preuves : manifest.json, runs/*/{input,prepared-mission,provider-1,result,measurement,oracle}.json, enveloppes et reçus natifs, bases SQLite isolées, journaux et vérification indépendante. Les clés locales sont conservées séparément hors du rapport et ne sont pas versionnées.', '');
  c.fs.writeFileSync(c.path.join(archive, 'rapport.md'), lines.join('\n'), { flag: 'wx' });
  console.log(JSON.stringify(data.summary));
}
module.exports = { report };
